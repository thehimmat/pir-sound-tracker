import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '../../../.env') });

import express, { type Request, type Response } from 'express';
import cors from 'cors';
import {
  getReadingsSince,
  getReadingsForDay,
  getDailySummary,
  getAllDailySummaries,
} from '@pir/db';

const API_PORT = parseInt(process.env.API_PORT ?? '3002', 10);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/readings/hour', async (_req: Request, res: Response) => {
  const since = Date.now() - 60 * 60 * 1000;
  res.json(await getReadingsSince(since));
});

app.get('/api/readings/today', async (_req: Request, res: Response) => {
  const today = new Date().toLocaleDateString('sv');
  res.json(await getReadingsForDay(today));
});

app.get('/api/readings/day/:date', async (req: Request, res: Response) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    return;
  }
  res.json(await getReadingsForDay(date));
});

app.get('/api/summary/today', async (_req: Request, res: Response) => {
  const today = new Date().toLocaleDateString('sv');
  res.json(await getDailySummary(today));
});

app.get('/api/summary/history', async (_req: Request, res: Response) => {
  res.json(await getAllDailySummaries());
});

app.listen(API_PORT, () => {
  console.log(`[api] listening on http://localhost:${API_PORT}`);
});
