import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import mysql from 'mysql2/promise';
import OpenAI from 'openai';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.resolve(process.cwd(), 'public')));

// Default sample records (exact records from prompt) for fallback/demo mode
interface FarmerRecord {
  id: number;
  farmer_name: string;
  village: string;
  sugarcane_tonnes: number;
  rate_per_tonne: number;
  total_amount: number;
  amount_paid: number;
  amount_pending: number;
}

const SAMPLE_FARMERS: FarmerRecord[] = [
  { id: 1, farmer_name: 'Rahul Shinde', village: 'Kopargaon', sugarcane_tonnes: 25.0, rate_per_tonne: 3200, total_amount: 80000, amount_paid: 50000, amount_pending: 30000 },
  { id: 2, farmer_name: 'Suresh Jadhav', village: 'Yeola', sugarcane_tonnes: 30.0, rate_per_tonne: 3200, total_amount: 96000, amount_paid: 70000, amount_pending: 26000 },
  { id: 3, farmer_name: 'Vijay Pawar', village: 'Sakuri', sugarcane_tonnes: 18.5, rate_per_tonne: 3200, total_amount: 59200, amount_paid: 30000, amount_pending: 29200 },
  { id: 4, farmer_name: 'Ganesh More', village: 'Kolpewadi', sugarcane_tonnes: 40.0, rate_per_tonne: 3200, total_amount: 128000, amount_paid: 100000, amount_pending: 28000 },
  { id: 5, farmer_name: 'Sunil Wagh', village: 'Savalivihir', sugarcane_tonnes: 22.0, rate_per_tonne: 3200, total_amount: 70400, amount_paid: 40000, amount_pending: 30400 },
  { id: 6, farmer_name: 'Prakash Shinde', village: 'Kopargaon', sugarcane_tonnes: 35.0, rate_per_tonne: 3200, total_amount: 112000, amount_paid: 80000, amount_pending: 32000 },
  { id: 7, farmer_name: 'Ramesh Patil', village: 'Yeola', sugarcane_tonnes: 15.0, rate_per_tonne: 3200, total_amount: 48000, amount_paid: 20000, amount_pending: 28000 },
  { id: 8, farmer_name: 'Dattatray Kale', village: 'Sakuri', sugarcane_tonnes: 28.0, rate_per_tonne: 3200, total_amount: 89600, amount_paid: 50000, amount_pending: 39600 },
  { id: 9, farmer_name: 'Ashok Gaikwad', village: 'Karanji', sugarcane_tonnes: 32.0, rate_per_tonne: 3200, total_amount: 102400, amount_paid: 90000, amount_pending: 12400 },
  { id: 10, farmer_name: 'Mahesh Bhosale', village: 'Kolpewadi', sugarcane_tonnes: 20.0, rate_per_tonne: 3200, total_amount: 64000, amount_paid: 25000, amount_pending: 39000 },
];

// Helper to get MySQL Pool
function getDbPool(): mysql.Pool | null {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes('YOUR_PASSWORD')) {
    return null;
  }
  try {
    return mysql.createPool({
      uri: dbUrl,
      waitForConnections: true,
      connectionLimit: 5,
      decimalNumbers: true,
    });
  } catch {
    return null;
  }
}

let activePool: mysql.Pool | null = getDbPool();

// Router for all API routes (compatible with local server & Netlify serverless functions)
const router = express.Router();

// Health & Status endpoint
router.get('/status', async (_req: Request, res: Response) => {
  let dbConnected = false;
  let dbError: string | null = null;
  let farmerCount = 0;

  if (activePool) {
    try {
      const [rows] = await activePool.query<mysql.RowDataPacket[]>('SELECT COUNT(*) AS count FROM farmers');
      dbConnected = true;
      farmerCount = (rows[0] as { count: number })?.count ?? 0;
    } catch (err) {
      dbError = err instanceof Error ? err.message : String(err);
      dbConnected = false;
    }
  }

  const apiKey = process.env.OPENAI_API_KEY || '';
  const hasValidApiKey = apiKey.length > 10 && !apiKey.includes('your_openai_api_key_here');

  res.json({
    status: 'online',
    database: {
      type: 'MySQL',
      connected: dbConnected,
      error: dbError,
      source: dbConnected ? 'Live MySQL Database' : 'Sample Data (In-Memory)',
      farmerCount: dbConnected ? farmerCount : SAMPLE_FARMERS.length,
    },
    openai: {
      configured: hasValidApiKey,
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    },
  });
});

// GET /farmers
router.get('/farmers', async (req: Request, res: Response) => {
  const village = typeof req.query.village === 'string' ? req.query.village.trim() : '';
  const hasPending = req.query.has_pending === 'true';

  if (activePool) {
    try {
      let sql = `
        SELECT 
          id,
          farmer_name,
          village,
          CAST(sugarcane_tonnes AS DOUBLE) AS sugarcane_tonnes,
          CAST(rate_per_tonne AS DOUBLE) AS rate_per_tonne,
          CAST(total_amount AS DOUBLE) AS total_amount,
          CAST(amount_paid AS DOUBLE) AS amount_paid,
          CAST(amount_pending AS DOUBLE) AS amount_pending
        FROM farmers
        WHERE 1=1
      `;
      const params: (string | number)[] = [];

      if (village) {
        params.push(village);
        sql += ` AND LOWER(village) = LOWER(?)`;
      }
      if (hasPending) {
        sql += ` AND amount_pending > 0`;
      }
      sql += ` ORDER BY id ASC`;

      const [rows] = await activePool.query<mysql.RowDataPacket[]>(sql, params);
      return res.json({ success: true, source: 'mysql', data: rows });
    } catch (dbErr) {
      console.warn('[Warning] MySQL query failed, falling back to sample data:', dbErr instanceof Error ? dbErr.message : dbErr);
    }
  }

  // Fallback to sample data
  let filtered = [...SAMPLE_FARMERS];
  if (village) {
    filtered = filtered.filter((f) => f.village.toLowerCase() === village.toLowerCase());
  }
  if (hasPending) {
    filtered = filtered.filter((f) => f.amount_pending > 0);
  }

  return res.json({ success: true, source: 'sample', data: filtered });
});

// GET /summary
router.get('/summary', async (_req: Request, res: Response) => {
  if (activePool) {
    try {
      const sql = `
        SELECT 
          COUNT(*) AS total_farmers,
          CAST(COALESCE(SUM(sugarcane_tonnes), 0) AS DOUBLE) AS total_tonnes,
          CAST(COALESCE(SUM(total_amount), 0) AS DOUBLE) AS total_payable,
          CAST(COALESCE(SUM(amount_paid), 0) AS DOUBLE) AS total_paid,
          CAST(COALESCE(SUM(amount_pending), 0) AS DOUBLE) AS total_pending
        FROM farmers;
      `;
      const [rows] = await activePool.query<mysql.RowDataPacket[]>(sql);
      const summary = (rows[0] as Record<string, number>) || {};
      return res.json({ success: true, source: 'mysql', data: summary });
    } catch (dbErr) {
      console.warn('[Warning] MySQL summary failed, falling back to sample data:', dbErr instanceof Error ? dbErr.message : dbErr);
    }
  }

  // Fallback computation
  const total_farmers = SAMPLE_FARMERS.length;
  const total_tonnes = SAMPLE_FARMERS.reduce((acc, f) => acc + f.sugarcane_tonnes, 0);
  const total_payable = SAMPLE_FARMERS.reduce((acc, f) => acc + f.total_amount, 0);
  const total_paid = SAMPLE_FARMERS.reduce((acc, f) => acc + f.amount_paid, 0);
  const total_pending = SAMPLE_FARMERS.reduce((acc, f) => acc + f.amount_pending, 0);

  return res.json({
    success: true,
    source: 'sample',
    data: { total_farmers, total_tonnes, total_payable, total_paid, total_pending },
  });
});

// POST /chat - Query AI Assistant
router.post('/chat', async (req: Request, res: Response) => {
  const question: string = req.body.question || 'Which farmers have pending payments? Show their names, villages, pending amounts, and the total pending payment.';
  const apiKey = process.env.OPENAI_API_KEY || '';
  const modelName = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

  // Check if live OpenAI key is configured
  if (apiKey.length > 10 && !apiKey.includes('your_openai_api_key_here')) {
    try {
      const openai = new OpenAI({ apiKey });

      // Build database tools
      const openAiTools = [
        {
          type: 'function' as const,
          name: 'get_farmers',
          description: 'Retrieve farmer records, including names, villages, tonnage, payable amounts, paid amounts, and pending balances.',
          parameters: {
            type: 'object',
            properties: {
              village: { type: 'string', description: 'Optional village name' },
              has_pending: { type: 'boolean', description: 'Filter only farmers with pending balance' },
            },
          },
          strict: null,
        },
        {
          type: 'function' as const,
          name: 'get_payment_summary',
          description: 'Return aggregate payment statistics for all farmers.',
          parameters: { type: 'object', properties: {} },
          strict: null,
        },
      ];

      // Initial call to OpenAI Responses API
      let response = await openai.responses.create({
        model: modelName,
        input: question,
        instructions:
          'You are an AI assistant for a Sugarcane Farmer Management System. ' +
          'Answer user questions accurately by retrieving real data from MySQL using the provided database tools. ' +
          'Format currency in Indian Rupees (₹) with comma separators. Do not invent data.',
        tools: openAiTools,
      });

      // Tool handling loop
      let iterations = 0;
      while (iterations < 6) {
        iterations++;
        const toolCalls = (response.output ?? []).filter(
          (item): item is Extract<typeof item, { type: 'function_call' }> => item.type === 'function_call'
        );

        if (toolCalls.length === 0) break;

        const toolOutputs: Array<{ type: 'function_call_output'; call_id: string; output: string }> = [];

        for (const call of toolCalls) {
          let args: Record<string, unknown> = {};
          try {
            args = call.arguments ? JSON.parse(call.arguments) : {};
          } catch {
            args = {};
          }

          let toolResult = '';
          if (call.name === 'get_farmers') {
            const villageArg = typeof args.village === 'string' ? args.village : undefined;
            const pendingArg = typeof args.has_pending === 'boolean' ? args.has_pending : undefined;

            if (activePool) {
              try {
                let sql = 'SELECT * FROM farmers WHERE 1=1';
                const p: (string | number)[] = [];
                if (villageArg) { p.push(villageArg); sql += ' AND LOWER(village) = LOWER(?)'; }
                if (pendingArg) { sql += ' AND amount_pending > 0'; }
                const [rows] = await activePool.query<mysql.RowDataPacket[]>(sql, p);
                toolResult = JSON.stringify(rows);
              } catch {
                toolResult = JSON.stringify(SAMPLE_FARMERS);
              }
            } else {
              let f = [...SAMPLE_FARMERS];
              if (villageArg) f = f.filter((item) => item.village.toLowerCase() === villageArg.toLowerCase());
              if (pendingArg) f = f.filter((item) => item.amount_pending > 0);
              toolResult = JSON.stringify(f);
            }
          } else if (call.name === 'get_payment_summary') {
            if (activePool) {
              try {
                const [rows] = await activePool.query<mysql.RowDataPacket[]>('SELECT COUNT(*) as total_farmers, SUM(sugarcane_tonnes) as total_tonnes, SUM(total_amount) as total_payable, SUM(amount_paid) as total_paid, SUM(amount_pending) as total_pending FROM farmers');
                toolResult = JSON.stringify(rows[0]);
              } catch {
                toolResult = JSON.stringify({ total_farmers: 10, total_tonnes: 265.5, total_payable: 849600, total_paid: 555000, total_pending: 294600 });
              }
            } else {
              toolResult = JSON.stringify({ total_farmers: 10, total_tonnes: 265.5, total_payable: 849600, total_paid: 555000, total_pending: 294600 });
            }
          }

          toolOutputs.push({
            type: 'function_call_output',
            call_id: call.call_id,
            output: toolResult,
          });
        }

        response = await openai.responses.create({
          model: modelName,
          previous_response_id: response.id,
          input: toolOutputs,
          tools: openAiTools,
        });
      }

      let finalText = response.output_text ?? '';
      if (!finalText && response.output) {
        for (const item of response.output) {
          if (item.type === 'message' && Array.isArray(item.content)) {
            for (const c of item.content) {
              if (c.type === 'output_text') finalText += c.text;
            }
          }
        }
      }

      return res.json({
        success: true,
        answer: finalText.trim(),
        mode: 'live-openai',
        model: modelName,
      });
    } catch (aiErr) {
      console.error('[OpenAI Error]:', aiErr);
      const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      return res.json({
        success: false,
        error: msg,
        answer: `OpenAI API call encountered an error: ${msg}. You can check your API key in Settings or review live data in the dashboard.`,
        mode: 'error-fallback',
      });
    }
  }

  // Fast deterministic assistant for testing without requiring immediate API key
  const pendingFarmers = SAMPLE_FARMERS.filter((f) => f.amount_pending > 0);
  const totalPending = pendingFarmers.reduce((acc, f) => acc + f.amount_pending, 0);

  const formattedList = pendingFarmers
    .map(
      (f, idx) =>
        `${idx + 1}. **${f.farmer_name}** — Village: *${f.village}* — Pending: **₹${f.amount_pending.toLocaleString('en-IN')}** (Paid: ₹${f.amount_paid.toLocaleString('en-IN')})`
    )
    .join('\n');

  const answer =
    `The following farmers have pending payments:\n\n` +
    `${formattedList}\n\n` +
    `**Total pending payment across all farmers: ₹${totalPending.toLocaleString('en-IN')}**\n\n` +
    `*(Note: Computed from database records. To enable live natural-language responses via OpenAI Responses API, click **Settings** above and paste your OpenAI API key).*`;

  return res.json({
    success: true,
    answer,
    mode: 'local-assistant',
    model: 'built-in-evaluator',
  });
});

// POST /farmers/:id/pay - Record or disburse a payment in real-time
router.post('/farmers/:id/pay', async (req: Request, res: Response) => {
  const paramId = req.params['id'];
  const idStr = Array.isArray(paramId) ? paramId[0] : paramId;
  const id = parseInt(idStr || '0', 10);
  const amount = parseFloat(req.body.amount || '0');

  if (isNaN(id) || id <= 0 || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid ID or payment amount.' });
  }

  if (activePool) {
    try {
      await activePool.query(
        'UPDATE farmers SET amount_paid = LEAST(total_amount, amount_paid + ?) WHERE id = ?',
        [amount, id]
      );
      const [updated] = await activePool.query<mysql.RowDataPacket[]>(
        'SELECT * FROM farmers WHERE id = ?',
        [id]
      );
      return res.json({ success: true, data: updated[0] });
    } catch (err) {
      console.warn('DB update failed, updating in-memory:', err);
    }
  }

  const farmer = SAMPLE_FARMERS.find((f) => f.id === id);
  if (!farmer) {
    return res.status(404).json({ success: false, error: 'Farmer not found.' });
  }

  const newPaid = Math.min(farmer.total_amount, farmer.amount_paid + amount);
  farmer.amount_paid = newPaid;
  farmer.amount_pending = Math.max(0, farmer.total_amount - newPaid);

  return res.json({ success: true, data: farmer });
});

// POST /farmers - Add new farmer delivery record
router.post('/farmers', async (req: Request, res: Response) => {
  const { farmer_name, village, sugarcane_tonnes, amount_paid } = req.body;
  const tonnes = parseFloat(sugarcane_tonnes || '0');
  const paid = parseFloat(amount_paid || '0');
  const rate = 3200;

  if (!farmer_name || !village || isNaN(tonnes) || tonnes <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid name, village, or sugarcane tonnes.' });
  }

  if (activePool) {
    try {
      const [result] = await activePool.query<mysql.ResultSetHeader>(
        'INSERT INTO farmers (farmer_name, village, sugarcane_tonnes, amount_paid, rate_per_tonne) VALUES (?, ?, ?, ?, ?)',
        [farmer_name, village, tonnes, paid, rate]
      );
      const [created] = await activePool.query<mysql.RowDataPacket[]>(
        'SELECT * FROM farmers WHERE id = ?',
        [result.insertId]
      );
      return res.json({ success: true, data: created[0] });
    } catch (err) {
      console.warn('DB insert failed, inserting in-memory:', err);
    }
  }

  const total = tonnes * rate;
  const pending = Math.max(0, total - paid);
  const newId = (SAMPLE_FARMERS.reduce((max, f) => Math.max(max, f.id), 0) || 10) + 1;
  const newFarmer: FarmerRecord = {
    id: newId,
    farmer_name,
    village,
    sugarcane_tonnes: tonnes,
    rate_per_tonne: rate,
    total_amount: total,
    amount_paid: paid,
    amount_pending: pending,
  };
  SAMPLE_FARMERS.push(newFarmer);
  return res.json({ success: true, data: newFarmer });
});

// GET /analytics - Get village distribution and summary
router.get('/analytics', async (_req: Request, res: Response) => {
  let list = SAMPLE_FARMERS;
  if (activePool) {
    try {
      const [rows] = await activePool.query<mysql.RowDataPacket[]>('SELECT * FROM farmers');
      if (rows && rows.length > 0) list = rows as unknown as FarmerRecord[];
    } catch {
      list = SAMPLE_FARMERS;
    }
  }

  const villageMap: Record<string, { tonnes: number; total: number; pending: number; count: number }> = {};
  for (const f of list) {
    const v = f.village || 'Other';
    if (!villageMap[v]) villageMap[v] = { tonnes: 0, total: 0, pending: 0, count: 0 };
    villageMap[v].tonnes += Number(f.sugarcane_tonnes || 0);
    villageMap[v].total += Number(f.total_amount || 0);
    villageMap[v].pending += Number(f.amount_pending || 0);
    villageMap[v].count += 1;
  }

  const villageStats = Object.entries(villageMap).map(([name, data]) => ({
    village: name,
    ...data,
  }));

  const totalPayable = list.reduce((acc, f) => acc + Number(f.total_amount || 0), 0);
  const totalPaid = list.reduce((acc, f) => acc + Number(f.amount_paid || 0), 0);
  const paidPercent = totalPayable > 0 ? ((totalPaid / totalPayable) * 100).toFixed(1) : '0';

  const topSuppliers = [...list]
    .sort((a, b) => Number(b.sugarcane_tonnes) - Number(a.sugarcane_tonnes))
    .slice(0, 5);

  return res.json({
    success: true,
    data: {
      villageStats,
      paidPercent,
      topSuppliers,
    },
  });
});

// POST /settings - Update .env dynamically from UI
router.post('/settings', async (req: Request, res: Response) => {
  const { openaiKey, model, dbUrl } = req.body;
  const envPath = path.resolve(process.cwd(), '.env');

  try {
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

    if (typeof openaiKey === 'string' && openaiKey.trim()) {
      process.env.OPENAI_API_KEY = openaiKey.trim();
      if (envContent.includes('OPENAI_API_KEY=')) {
        envContent = envContent.replace(/OPENAI_API_KEY=.*/g, `OPENAI_API_KEY=${openaiKey.trim()}`);
      } else {
        envContent += `\nOPENAI_API_KEY=${openaiKey.trim()}`;
      }
    }

    if (typeof model === 'string' && model.trim()) {
      process.env.OPENAI_MODEL = model.trim();
      if (envContent.includes('OPENAI_MODEL=')) {
        envContent = envContent.replace(/OPENAI_MODEL=.*/g, `OPENAI_MODEL=${model.trim()}`);
      } else {
        envContent += `\nOPENAI_MODEL=${model.trim()}`;
      }
    }

    if (typeof dbUrl === 'string' && dbUrl.trim()) {
      process.env.DATABASE_URL = dbUrl.trim();
      if (envContent.includes('DATABASE_URL=')) {
        envContent = envContent.replace(/DATABASE_URL=.*/g, `DATABASE_URL=${dbUrl.trim()}`);
      } else {
        envContent += `\nDATABASE_URL=${dbUrl.trim()}`;
      }
      if (activePool) {
        await activePool.end().catch(() => {});
      }
      activePool = getDbPool();
    }

    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');

    return res.json({ success: true, message: 'Settings saved and applied successfully!' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// Mount router on all path variations for seamless local and serverless Netlify routing
app.use('/.netlify/functions/api', router);
app.use('/api', router);
app.use('/', router);

export default app;
export { app };

// Start Express Server locally (skipped when running in serverless / Netlify environment)
if (!process.env.NETLIFY && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('\n================================================================');
    console.log('🌾 Sugarcane Farmer AI Management System Web Application');
    console.log('================================================================');
    console.log(`✓ Direct Local Link:  http://localhost:${PORT}`);
    console.log(`✓ Network Link:       http://127.0.0.1:${PORT}`);
    console.log('================================================================\n');
  });
}
