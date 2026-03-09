import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors             from 'cors';
import { scoreRouter }  from './routes/score.js';
import { verifyRouter } from './routes/verify.js';
import { lendingRouter }from './routes/lending.js';
import { feeInfoRouter }from './routes/feeInfo.js';

// ── Env validation — server refuses to start if any required var is missing ───
const REQUIRED_ENV = [
  'MISTRAL_API_KEY',
  'ISSUER_PRIVATE_KEY',
  'SCORE_NFT_PROXY',
] as const;

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌  Missing required env var: ${key}`);
    process.exit(1);
  }
}

const PORT         = parseInt(process.env.PORT ?? '3001', 10);
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

const app = express();

// ── Core middleware ───────────────────────────────────────────────────────────
app.use(express.json());

// ── Request logging ───────────────────────────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms  = Date.now() - start;
    const s   = res.statusCode;
    const col = s >= 500 ? '\x1b[31m' : s >= 400 ? '\x1b[33m' : '\x1b[32m';
    const rst = '\x1b[0m';
    console.log(
      `${new Date().toISOString()}  ${col}${s}${rst}  ${req.method.padEnd(6)} ${req.path.padEnd(42)} ${ms}ms`
    );
  });
  next();
});

// ── CORS ──────────────────────────────────────────────────────────────────────
const defaultCors = cors({ origin: FRONTEND_URL, credentials: true });
const openCors    = cors({ origin: '*', methods: ['GET', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] });

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/score',    defaultCors, scoreRouter);
app.use('/verify',   openCors,    verifyRouter);
app.use('/lending',  openCors,    lendingRouter);
app.use('/fee-info', defaultCors, feeInfoRouter);
app.options('/verify/*',  openCors);
app.options('/lending/*', openCors);

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status:   'ok',
    version:  '5.0.0',
    network:  'PAS TestNet',
    chainId:  420420417,
    contract: process.env.SCORE_NFT_PROXY,
  });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ── Global error handler — never exposes stack traces to the client ───────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const msg = err instanceof Error ? err.message : 'Internal server error';
  console.error('[uncaught]', err); // full stack stays on the server only
  res.status(500).json({ success: false, error: msg });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('┌──────────────────────────────────────────────────────┐');
  console.log('│  VeraScore Backend  v5.0.0  (Phase 6)               │');
  console.log('├──────────────────────────────────────────────────────┤');
  console.log(`│  Port:     ${PORT}                                     │`);
  console.log(`│  Network:  PAS TestNet  (Chain ID: 420420417)        │`);
  console.log(`│  Contract: ${process.env.SCORE_NFT_PROXY}  │`);
  console.log(`│  Frontend: ${FRONTEND_URL.padEnd(43)}│`);
  console.log('├──────────────────────────────────────────────────────┤');
  console.log('│  Rate limit: 1 score request per address per 60 min │');
  console.log('│  Logging:    enabled (method · path · status · ms)  │');
  console.log('│  Errors:     stack traces never sent to client       │');
  console.log('└──────────────────────────────────────────────────────┘');
  console.log('');
});