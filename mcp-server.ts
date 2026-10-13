import dotenv from 'dotenv';
dotenv.config();

import mysql from 'mysql2/promise';
import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

// Database configuration supporting either DATABASE_URL or individual variables
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && !process.env.MYSQL_USER) {
  console.error('[MCP Server WARNING] Neither DATABASE_URL nor MYSQL_USER environment variable is defined.');
  console.error('[MCP Server WARNING] Expected DATABASE_URL format: mysql://root:YOUR_PASSWORD@localhost:3306/sugarcane_db');
}

// Create MySQL connection pool
const pool = databaseUrl
  ? mysql.createPool({
      uri: databaseUrl,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      decimalNumbers: true,
    })
  : mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      port: Number(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'sugarcane_db',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      decimalNumbers: true,
    });

// Argument validation schemas using Zod
const GetFarmersArgsSchema = z.object({
  village: z.string().optional(),
  has_pending: z.boolean().optional(),
});

// Initialize MCP Server
const server = new Server(
  {
    name: 'sugarcane-farmer-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register MCP Tools listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_farmers',
        description:
          'Retrieve farmer records, including their names, villages, sugarcane quantities, total payable amounts, amounts paid, and pending balances. Supports optional filtering by village name or pending payment status.',
        inputSchema: {
          type: 'object',
          properties: {
            village: {
              type: 'string',
              description: 'Optional village name to filter records (e.g., Kopargaon, Yeola, Sakuri, Kolpewadi, Savalivihir, Karanji)',
            },
            has_pending: {
              type: 'boolean',
              description: 'Optional filter: set to true to retrieve only farmers with a positive pending balance (amount_pending > 0)',
            },
          },
        },
      },
      {
        name: 'get_payment_summary',
        description:
          'Return aggregate statistics for all farmers, including total farmer count, total sugarcane tonnes supplied, total payable amount, total paid amount, and total pending amount.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Register Tool Execution handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const toolArguments = request.params.arguments ?? {};

  try {
    switch (toolName) {
      case 'get_farmers': {
        const parsed = GetFarmersArgsSchema.safeParse(toolArguments);
        if (!parsed.success) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Invalid arguments for get_farmers: ${parsed.error.message}`,
              },
            ],
          };
        }

        const { village, has_pending } = parsed.data;

        // Build parameterized MySQL query
        let queryText = `
          SELECT 
            id,
            farmer_name,
            village,
            CAST(sugarcane_tonnes AS DOUBLE) AS sugarcane_tonnes,
            CAST(total_amount AS DOUBLE) AS total_amount,
            CAST(amount_paid AS DOUBLE) AS amount_paid,
            CAST(amount_pending AS DOUBLE) AS amount_pending
          FROM farmers
          WHERE 1=1
        `;
        const queryParams: (string | number)[] = [];

        if (village && village.trim().length > 0) {
          queryParams.push(village.trim());
          queryText += ` AND LOWER(village) = LOWER(?)`;
        }

        if (typeof has_pending === 'boolean') {
          if (has_pending) {
            queryText += ` AND amount_pending > 0`;
          } else {
            queryText += ` AND amount_pending = 0`;
          }
        }

        queryText += ` ORDER BY id ASC`;

        const [rows] = await pool.query(queryText, queryParams);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(rows, null, 2),
            },
          ],
        };
      }

      case 'get_payment_summary': {
        // Aggregate statistics safely handling empty table
        const queryText = `
          SELECT 
            COUNT(*) AS total_farmers,
            CAST(COALESCE(SUM(sugarcane_tonnes), 0) AS DOUBLE) AS total_tonnes,
            CAST(COALESCE(SUM(total_amount), 0) AS DOUBLE) AS total_payable,
            CAST(COALESCE(SUM(amount_paid), 0) AS DOUBLE) AS total_paid,
            CAST(COALESCE(SUM(amount_pending), 0) AS DOUBLE) AS total_pending
          FROM farmers;
        `;

        const [rows] = await pool.query(queryText);
        const rowList = rows as Array<{
          total_farmers: number;
          total_tonnes: number;
          total_payable: number;
          total_paid: number;
          total_pending: number;
        }>;

        const summary = rowList[0] ?? {
          total_farmers: 0,
          total_tonnes: 0,
          total_payable: 0,
          total_paid: 0,
          total_pending: 0,
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(summary, null, 2),
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
    }
  } catch (error) {
    console.error(`[MCP Server Error executing ${toolName}]:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Database error executing tool '${toolName}': ${errorMessage}`,
        },
      ],
    };
  }
});

// Graceful cleanup
async function shutdown() {
  console.error('[MCP Server] Shutting down and closing MySQL connection pool...');
  try {
    await pool.end();
  } catch (err) {
    console.error('[MCP Server] Error closing pool:', err);
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Connect stdio transport and start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP Server] Sugarcane MySQL MCP Server is running on stdio');
}

main().catch((err) => {
  console.error('[MCP Server Fatal Error]:', err);
  process.exit(1);
});
