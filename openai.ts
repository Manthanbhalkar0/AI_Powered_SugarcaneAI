import dotenv from 'dotenv';
dotenv.config();

import path from 'node:path';
import OpenAI from 'openai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// ============================================================================
// HARDCODED QUESTION
// You can change the question by editing the constant below:
// ============================================================================
export const HARDCODED_QUESTION =
  'Which farmers have pending payments? Show their names, villages, pending amounts, and the total pending payment.';

// ============================================================================
// Environment Validation
// ============================================================================
function validateEnvironment(): { apiKey: string; modelName: string } {
  const apiKey = process.env.OPENAI_API_KEY;
  const modelName = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

  if (
    !apiKey ||
    apiKey.trim() === '' ||
    apiKey.includes('your_openai_api_key_here') ||
    apiKey.includes('YOUR_OPENAI_API_KEY')
  ) {
    console.error('\n' + '='.repeat(70));
    console.error(' [CONFIGURATION REQUIRED] OpenAI API Key Missing or Placeholder Detected');
    console.error('='.repeat(70));
    console.error('Please configure your OpenAI API key in .env to run the AI assistant:');
    console.error('');
    console.error('  1. Open the file: D:\\SugarcaneAI\\.env');
    console.error('  2. Replace "your_openai_api_key_here" with your actual OpenAI API key:');
    console.error('     OPENAI_API_KEY=sk-proj-...');
    console.error('  3. Save the file and restart the application with: npm start');
    console.error('='.repeat(70) + '\n');
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL || '';
  if (dbUrl.includes('YOUR_PASSWORD')) {
    console.warn('\n[Notice] DATABASE_URL in .env still contains "YOUR_PASSWORD".');
    console.warn('If you have not done so, please update your MySQL password in D:\\SugarcaneAI\\.env.\n');
  }

  return { apiKey, modelName };
}

// ============================================================================
// Application Entry Point
// ============================================================================
async function main() {
  const { apiKey, modelName } = validateEnvironment();

  console.log('[System] Initializing Sugarcane Farmer AI Management System...');

  // Initialize OpenAI client
  const openai = new OpenAI({ apiKey });

  // Resolve path to tsx runner and mcp-server.ts for reliable cross-platform execution
  const tsxCliPath = path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs');
  const serverPath = path.resolve(process.cwd(), 'mcp-server.ts');

  // Spawn MCP server child process over standard I/O
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [tsxCliPath, serverPath],
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([_, v]) => v !== undefined) as [string, string][]
      ),
    },
    stderr: 'inherit',
  });

  const mcpClient = new Client(
    {
      name: 'sugarcane-ai-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  try {
    // Connect to MCP server
    await mcpClient.connect(transport);

    // Discover available MCP tools
    const toolsResponse = await mcpClient.listTools();
    const toolNames = toolsResponse.tools.map((t) => t.name).join(', ');
    console.log(`MCP tools: ${toolNames}\n`);

    // Map MCP tools to OpenAI Responses API function tools
    const openAiTools = toolsResponse.tools.map((tool) => ({
      type: 'function' as const,
      name: tool.name,
      description: tool.description ?? '',
      parameters: (tool.inputSchema as Record<string, unknown>) ?? {
        type: 'object',
        properties: {},
      },
      strict: null,
    }));

    // Print Question
    console.log('Question:');
    console.log(HARDCODED_QUESTION);
    console.log('');

    // Instructions guiding the model's reasoning and tool usage
    const systemInstructions =
      'You are an AI assistant for a Sugarcane Farmer Management System. ' +
      'Answer user questions accurately by retrieving real data from MySQL using the provided database tools. ' +
      'When displaying money amounts, format them clearly in Indian Rupees (₹) with appropriate commas (e.g., ₹30,000, ₹2,94,600). ' +
      'If a database tool fails or reports an error, state clearly that the database query failed and explain the error; never fabricate data.';

    // Send the question to OpenAI Responses API
    let response = await openai.responses.create({
      model: modelName,
      input: HARDCODED_QUESTION,
      instructions: systemInstructions,
      tools: openAiTools,
    });

    // Multi-turn tool execution loop
    const maxIterations = 10;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;

      // Identify any function call items in the model response
      const toolCalls = (response.output ?? []).filter(
        (item): item is Extract<typeof item, { type: 'function_call' }> =>
          item.type === 'function_call'
      );

      // If no function calls were requested, the model has completed its final answer
      if (toolCalls.length === 0) {
        break;
      }

      // Execute each requested tool call via the MCP client
      const toolOutputs: Array<{
        type: 'function_call_output';
        call_id: string;
        output: string;
      }> = [];

      for (const call of toolCalls) {
        let callArgs: Record<string, unknown> = {};
        try {
          callArgs = call.arguments ? JSON.parse(call.arguments) : {};
        } catch (parseErr) {
          console.error(`[Error] Failed to parse arguments for tool ${call.name}:`, parseErr);
        }

        try {
          const mcpResult = await mcpClient.callTool({
            name: call.name,
            arguments: callArgs,
          });

          let outputText = '';
          if (mcpResult.content && Array.isArray(mcpResult.content)) {
            outputText = mcpResult.content
              .map((c) => (c.type === 'text' ? c.text : JSON.stringify(c)))
              .join('\n');
          } else {
            outputText = JSON.stringify(mcpResult);
          }

          toolOutputs.push({
            type: 'function_call_output',
            call_id: call.call_id,
            output: outputText,
          });
        } catch (execErr) {
          const errMsg = execErr instanceof Error ? execErr.message : String(execErr);
          toolOutputs.push({
            type: 'function_call_output',
            call_id: call.call_id,
            output: JSON.stringify({ error: errMsg }),
          });
        }
      }

      // Send the tool results back to the Responses API
      response = await openai.responses.create({
        model: modelName,
        previous_response_id: response.id,
        input: toolOutputs,
        tools: openAiTools,
      });
    }

    // Extract and display the final AI answer
    let finalAnswer = response.output_text ?? '';
    if (!finalAnswer && response.output) {
      for (const item of response.output) {
        if (item.type === 'message' && Array.isArray(item.content)) {
          for (const part of item.content) {
            if (part.type === 'output_text') {
              finalAnswer += part.text;
            }
          }
        }
      }
    }

    console.log('AI Answer:');
    console.log(finalAnswer.trim());
    console.log('');
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      console.error('\n[OpenAI API Error]:');
      console.error(`Status: ${error.status} (${error.code || 'N/A'})`);
      console.error(`Message: ${error.message}`);
      if (error.status === 401) {
        console.error('\nAction Required: Your OpenAI API key is invalid or unauthorized.');
        console.error('Please update OPENAI_API_KEY in D:\\SugarcaneAI\\.env with a valid key.');
      } else if (error.status === 429) {
        console.error('\nAction Required: OpenAI API quota exceeded or rate limit reached.');
        console.error('Please verify your OpenAI account billing status at https://platform.openai.com/account/billing.');
      } else if (error.status === 404) {
        console.error(`\nAction Required: The model "${modelName}" was not found or is unavailable.`);
        console.error('Try changing OPENAI_MODEL in D:\\SugarcaneAI\\.env to "gpt-4.1-mini" or "gpt-4o-mini".');
      }
    } else {
      console.error('\n[Application Error]:', error instanceof Error ? error.message : error);
    }
    process.exitCode = 1;
  } finally {
    // Cleanly close MCP client and transport connections
    try {
      await mcpClient.close();
    } catch {
      // Ignore cleanup error
    }
    try {
      await transport.close();
    } catch {
      // Ignore cleanup error
    }
  }
}

main().catch((err) => {
  console.error('[Fatal Error]:', err);
  process.exit(1);
});
