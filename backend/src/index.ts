import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors             from 'cors';
import { scoreRouter }  from './routes/score.js';
import { verifyRouter } from './routes/verify.js';
import { lendingRouter }from './routes/lending.js';
import { feeInfoRouter }  from './routes/feeInfo.js';
import { balancesRouter }  from './routes/balances.js';

// ── Env validation — Added LENDING_POOL_ADDRESS to the required list ───
const REQUIRED_ENV = [
  'MISTRAL_API_KEY',
  'ISSUER_PRIVATE_KEY',
  'SCORE_NFT_PROXY',
  'LENDING_POOL_ADDRESS', // Added this for safety!
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
// Open CORS for public verification and lending integrations
const openCors    = cors({ origin: '*', methods: ['GET', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] });

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/score',    defaultCors, scoreRouter);
app.use('/verify',   openCors,    verifyRouter);
app.use('/lending',  openCors,    lendingRouter);
app.use('/fee-info', defaultCors, feeInfoRouter);
app.use('/balances', defaultCors, balancesRouter);

// Handle preflight for public routes
app.options('/verify/*',  openCors);
app.options('/lending/*', openCors);

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status:   'ok',
    version:  '5.1.0',
    network:  'PAS TestNet',
    chainId:  420420417,
    contract: process.env.SCORE_NFT_PROXY,
    lending:  process.env.LENDING_POOL_ADDRESS,
  });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const msg = err instanceof Error ? err.message : 'Internal server error';
  console.error('[uncaught]', err);
  res.status(500).json({ success: false, error: msg });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('┌──────────────────────────────────────────────────────┐');
  console.log('│  VeraScore Backend  v5.1.0  (Demo Ready)            │');
  console.log('├──────────────────────────────────────────────────────┤');
  console.log(`│  Port:     ${PORT.toString().padEnd(42)}│`);
  console.log(`│  Network:  PAS TestNet (420420417)               │`);
  console.log(`│  Proxy:    ${(process.env.SCORE_NFT_PROXY?.slice(0, 10) + '...' + process.env.SCORE_NFT_PROXY?.slice(-10)).padEnd(42)}│`);
  console.log(`│  Frontend: ${FRONTEND_URL.padEnd(42)}│`);
  console.log('├──────────────────────────────────────────────────────┤');
  console.log('│  Speed:     Optimized (No Sidecar timeouts)         │');
  console.log('│  Logging:   Enabled (Static Network mode)           │');
  console.log('└──────────────────────────────────────────────────────┘');
  console.log('');
});
