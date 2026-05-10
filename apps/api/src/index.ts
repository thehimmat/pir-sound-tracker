import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootEnv = resolve(__dirname, '../../../.env');
loadEnv({ path: rootEnv });

import express from 'express';
import cors from 'cors';
import {
  getDb,
  getReadingsSince,
  getReadingsForDay,
  getDailySummary,
  getAllDailySummaries,
} from '@pir/db';

const API_PORT = parseInt(process.env.API_PORT ?? '3002', 10);
const DB_PATH  = process.env.DB_PATH ?? resolve(__dirname, '../../../data/readings.db');

getDb(DB_PATH);

const app = express();
app.use(cors());
app.use(express.json());

// Last 60 minutes
app.get('/api/readings/hour', (_req, res) => {
  const since = Date.now() - 60 * 60 * 1000;
  res.json(getReadingsSince(since));
});

// Today midnight → now
app.get('/api/readings/today', (_req, res) => {
  const today = new Date().toLocaleDateString('sv'); // 'YYYY-MM-DD' via sv-SE locale
  res.json(getReadingsForDay(today));
});

// Specific date
app.get('/api/readings/day/:date', (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    return;
  }
  res.json(getReadingsForDay(date));
});

// Today summary
app.get('/api/summary/today', (_req, res) => {
  const today = new Date().toLocaleDateString('sv');
  res.json(getDailySummary(today));
});

// All-days summary
app.get('/api/summary/history', (_req, res) => {
  res.json(getAllDailySummaries());
});

app.listen(API_PORT, () => {
  console.log(`[api] listening on http://localhost:${API_PORT}`);
});
