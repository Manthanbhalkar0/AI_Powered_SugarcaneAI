# AI-Powered Sugarcane Farmer Management System (MySQL Edition)

An end-to-end, enterprise-ready demonstration system for sugarcane factory management. The application connects an AI assistant to a local **MySQL** database using the **Model Context Protocol (MCP)** and the **OpenAI Responses API**.

---

## 1. Project Purpose and Architecture

### Purpose
In sugarcane farming and factory procurement, tracking farmer deliveries, sugarcane tonnage, statutory payments, and outstanding balances is vital. This project allows sugar factory officers and managers to query data in natural language (e.g., *"Which farmers have pending payments? Show their names, villages, pending amounts, and the total pending payment."*). The AI assistant answers strictly using live data fetched via official MCP tools—preventing data hallucination.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Terminal (npm start)                     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                          openai.ts                          │
│  - Loads .env and validates API credentials                 │
│  - Spawns mcp-server.ts via MCP StdioClientTransport        │
│  - Discovers MCP Tools: get_farmers, get_payment_summary    │
│  - Sends natural-language question to OpenAI Responses API  │
│  - Executes model tool calls over MCP                       │
│  - Returns formatted AI Answer to terminal                  │
└──────────────┬──────────────────────────────▲───────────────┘
               │ (Standard I/O)               │ (Tool Results)
               ▼                              │
┌─────────────────────────────────────────────┴───────────────┐
│                        mcp-server.ts                        │
│  - Official TypeScript MCP Server SDK                       │
│  - Registers get_farmers & get_payment_summary tools        │
│  - Connects to MySQL via mysql2/promise connection pool     │
│  - Executes parameterized SQL queries                       │
│  - Returns structured JSON results                          │
└──────────────────────────────┬──────────────────────────────┘
                               │ (SQL Queries)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      MySQL (sugarcane_db)                   │
│  - farmers table with auto-calculated generated columns     │
│  - Real delivery, payment, and pending balance records      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Required Software

Before running the application, make sure you have the following installed on your computer:

1. **Node.js** (v18 or later, recommended v20+ or v24+): [Download Node.js](https://nodejs.org/)
2. **MySQL Server 8.0**: [Download MySQL Community Server](https://dev.mysql.com/downloads/mysql/) (Running service name: `MySQL80`)
3. **MySQL Workbench** or `mysql` CLI: [Download MySQL Workbench](https://dev.mysql.com/downloads/workbench/)
4. **Visual Studio Code**: [Download VS Code](https://code.visualstudio.com/)
5. **OpenAI Account**: With an active API key and available API credits/quota.

---

## 3. Database Setup (MySQL Workbench or CLI)

### Step 3.1: Execute `init_db.sql`

You can set up the database using either **MySQL Workbench** or the **Windows Terminal**:

#### Option A: Using MySQL Workbench (GUI)
1. Open **MySQL Workbench**.
2. Connect to your local MySQL instance (user: `root`).
3. Click **File** > **Open SQL Script...** and select [`D:\SugarcaneAI\init_db.sql`](file:///D:/SugarcaneAI/init_db.sql).
4. Click the **Execute (⚡)** button to run the entire script.

#### Option B: Using Command Line (PowerShell)
Open PowerShell in `D:\SugarcaneAI` and run:
```powershell
mysql -u root -p < init_db.sql
```
*(Enter your MySQL root password when prompted)*

---

### Step 3.2: SQL Schema & Data Reference

The script sets up the following schema with stored generated columns:

```sql
CREATE DATABASE IF NOT EXISTS sugarcane_db;
USE sugarcane_db;

DROP TABLE IF EXISTS farmers;

CREATE TABLE farmers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    farmer_name VARCHAR(100) NOT NULL,
    village VARCHAR(100) NOT NULL,
    sugarcane_tonnes DECIMAL(10,2) NOT NULL,
    rate_per_tonne DECIMAL(10,2) NOT NULL DEFAULT 3200.00,
    total_amount DECIMAL(12,2) GENERATED ALWAYS AS (sugarcane_tonnes * rate_per_tonne) STORED,
    amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    amount_pending DECIMAL(12,2) GENERATED ALWAYS AS (sugarcane_tonnes * rate_per_tonne - amount_paid) STORED,
    CONSTRAINT chk_sugarcane_tonnes CHECK (sugarcane_tonnes >= 0),
    CONSTRAINT chk_rate_per_tonne CHECK (rate_per_tonne >= 0),
    CONSTRAINT chk_amount_paid_positive CHECK (amount_paid >= 0),
    CONSTRAINT chk_amount_paid_limit CHECK (amount_paid <= sugarcane_tonnes * rate_per_tonne)
);

INSERT INTO farmers
    (farmer_name, village, sugarcane_tonnes, amount_paid)
VALUES
    ('Rahul Shinde', 'Kopargaon', 25.00, 50000),
    ('Suresh Jadhav', 'Yeola', 30.00, 70000),
    ('Vijay Pawar', 'Sakuri', 18.50, 30000),
    ('Ganesh More', 'Kolpewadi', 40.00, 100000),
    ('Sunil Wagh', 'Savalivihir', 22.00, 40000),
    ('Prakash Shinde', 'Kopargaon', 35.00, 80000),
    ('Ramesh Patil', 'Yeola', 15.00, 20000),
    ('Dattatray Kale', 'Sakuri', 28.00, 50000),
    ('Ashok Gaikwad', 'Karanji', 32.00, 90000),
    ('Mahesh Bhosale', 'Kolpewadi', 20.00, 25000);
```

Verify the records:
```sql
SELECT * FROM farmers;
```

---

## 4. How to Obtain and Configure an OpenAI API Key

> **IMPORTANT**: An OpenAI API key is required to run the AI assistant. OpenAI API usage is paid and incurs charges against your OpenAI account balance.

1. Go to the [OpenAI Platform](https://platform.openai.com/).
2. Log in or create an account.
3. In the navigation sidebar, go to **API keys** (or visit [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)).
4. Click **Create new secret key**.
5. Give it a name (e.g., `sugarcane-ai-key`) and click **Create secret key**.
6. Copy the key immediately (it looks like `sk-proj-...` or `sk-...`).
7. Ensure your OpenAI account has credits added under [Billing](https://platform.openai.com/account/billing).

---

## 5. Where to Apply Your API Key and Configure `.env`

In the root project folder `D:\SugarcaneAI`, open the file named **`.env`**.

Edit the file to supply your actual OpenAI API Key and your MySQL root password:

```dotenv
# OpenAI Configuration
# Paste your OpenAI API key here:
OPENAI_API_KEY=sk-proj-YOUR_ACTUAL_API_KEY_HERE

# Model name (default: gpt-4.1-mini or gpt-4o-mini)
OPENAI_MODEL=gpt-4.1-mini

# MySQL Connection URL
# Replace YOUR_PASSWORD with your actual MySQL root password:
DATABASE_URL=mysql://root:YOUR_PASSWORD@localhost:3306/sugarcane_db
```

> **Security Note:** `.env` is automatically ignored by `.gitignore` so your secrets are never committed to version control.

---

## 6. Installing Dependencies

Open PowerShell in `D:\SugarcaneAI`:

```powershell
cd D:\SugarcaneAI
npm install
```

The installed dependencies include:
- `@modelcontextprotocol/sdk` (Official Model Context Protocol SDK)
- `openai` (Official OpenAI SDK with Responses API)
- `mysql2` (High-performance MySQL client with Promise support)
- `zod` (Input validation)
- `dotenv` (Environment variable management)
- `tsx` & `typescript` (Modern TypeScript execution)

---

## 7. Starting the Project

Run the application with:

```powershell
npm start
```

You can also run typechecking at any time:

```powershell
npm run typecheck
```

---

## 8. Expected Terminal Output

When you run `npm start` with a working MySQL database and valid OpenAI key, the output will look like:

```text
> sugarcaneai@1.0.0 start
> tsx openai.ts

MCP tools: get_farmers, get_payment_summary

Question:
Which farmers have pending payments? Show their names, villages, pending amounts, and the total pending payment.

AI Answer:
The following farmers have pending payments:

1. Rahul Shinde — Kopargaon — ₹30,000
2. Suresh Jadhav — Yeola — ₹26,000
3. Vijay Pawar — Sakuri — ₹29,200
4. Ganesh More — Kolpewadi — ₹28,000
5. Sunil Wagh — Savalivihir — ₹30,400
6. Prakash Shinde — Kopargaon — ₹32,000
7. Ramesh Patil — Yeola — ₹28,000
8. Dattatray Kale — Sakuri — ₹39,600
9. Ashok Gaikwad — Karanji — ₹12,400
10. Mahesh Bhosale — Kolpewadi — ₹39,000

Total pending payment: ₹2,94,600
```

---

## 9. How to Change the Hardcoded Question

To ask a different question:

1. Open `D:\SugarcaneAI\openai.ts`.
2. Locate the clearly marked constant near the top:
```typescript
// ============================================================================
// HARDCODED QUESTION
// You can change the question by editing the constant below:
// ============================================================================
export const HARDCODED_QUESTION =
  'Which farmers have pending payments? Show their names, villages, pending amounts, and the total pending payment.';
```
3. Change `HARDCODED_QUESTION` to any question of your choice, for example:
```typescript
export const HARDCODED_QUESTION =
  'Give me an executive summary of total sugarcane received, total payable amount, and total pending amount across all villages.';
```
4. Save the file and run `npm start`.

---

## 10. Troubleshooting Guide

### 1. MySQL Connection Failure (`ER_ACCESS_DENIED_ERROR` or `ECONNREFUSED`)
- **Cause:** MySQL server is stopped, or the password in `.env` is incorrect.
- **Solution:**
  1. Open Windows Services (`services.msc`) and verify that `MySQL80` (or `mysql`) is **Running**.
  2. Open `D:\SugarcaneAI\.env` and verify `DATABASE_URL`. Make sure you replaced `YOUR_PASSWORD` with your actual MySQL password.
  3. Verify you can connect to `sugarcane_db` in MySQL Workbench or via `mysql -u root -p`.

### 2. Missing or Placeholder OpenAI API Key
- **Error:** `[CONFIGURATION REQUIRED] OpenAI API Key Missing or Placeholder Detected`
- **Solution:**
  1. Open `D:\SugarcaneAI\.env`.
  2. Set `OPENAI_API_KEY=sk-...` to your real OpenAI API key.
  3. Save the file and rerun `npm start`.

### 3. Invalid OpenAI API Key (`401 Unauthorized`)
- **Error:** `Status: 401 (invalid_api_key)`
- **Solution:** Generate a fresh key at [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys) and paste it into `.env`.

### 4. Insufficient Quota (`429 RateLimitError`)
- **Error:** `Status: 429 (insufficient_quota)`
- **Solution:** Your OpenAI API account has zero credit balance or your trial credits expired. Add credits at [https://platform.openai.com/account/billing](https://platform.openai.com/account/billing).

### 5. Model Not Available (`404 Not Found`)
- **Error:** `Model 'gpt-4.1-mini' was not found`
- **Solution:** Open `.env` and switch `OPENAI_MODEL=gpt-4o-mini` or another model enabled on your account.

### 6. TypeScript Compilation Errors
- Run `npm run typecheck` (`tsc --noEmit`) to verify types. The configuration uses strict ESM checks under Node.js Next.
