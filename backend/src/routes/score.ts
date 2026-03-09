import { Router, Request, Response } from 'express';
import { ethers }                    from 'ethers';
import { readWalletData }            from '../chain/papiReader.js';
import { scoreWallet }               from '../scoring/mistralScorer.js';
import { buildSignedPayload }        from '../scoring/signer.js';
import { saveScore, getHistory, getLeaderboard, getTotalUniqueWallets } from '../db/database.js';

export const scoreRouter = Router();

const RPC_URL  = 'https://services.polkadothub-rpc.com/testnet';
const CHAIN_ID = 420420417;

const SCORE_NFT_ABI = [
  'function getScore(address wallet) external view returns (uint16 score, uint64 issuedAt, uint64 expiresAt, bytes32 dataHash, bool isValid, bool exists)',
  'function totalScored() external view returns (uint256)',
  'function refreshAvailableAt(address wallet) external view returns (uint64)',
  'function recordBreakdown(address wallet, uint8[6] calldata bd) external',
];

// ── Rate limit: 1 request per address per 60 MINUTES ─────────────────────────
const RATE_LIMIT_MS = 60 * 60 * 1_000; // 60 minutes
const rateLimitMap  = new Map<string, number>();

// ── V3: record category breakdown on-chain after every mint ──────────────────
async function recordBreakdownOnChain(
  wallet:    string,
  breakdown: Record<string, number>,
): Promise<void> {
  const privateKey   = process.env.ISSUER_PRIVATE_KEY;
  const proxyAddress = process.env.SCORE_NFT_PROXY;
  if (!privateKey || !proxyAddress) {
    console.warn('[v3] ISSUER_PRIVATE_KEY or SCORE_NFT_PROXY not set — skipping recordBreakdown');
    return;
  }

  const provider     = new ethers.JsonRpcProvider(RPC_URL, { chainId: CHAIN_ID, name: 'polkadot-testnet' });
  const issuerWallet = new ethers.Wallet(privateKey, provider);
  const contract     = new ethers.Contract(proxyAddress, SCORE_NFT_ABI, issuerWallet);

  // Slot order must match contract: [txActivity, accountAge, nativeBalance, usdtHolding, usdcHolding, complexity]
  const bd: [number, number, number, number, number, number] = [
    Math.min(255, Math.round(breakdown.transactionActivity ?? 0)),
    Math.min(255, Math.round(breakdown.accountAge          ?? 0)),
    Math.min(255, Math.round(breakdown.nativeBalance       ?? 0)),
    Math.min(255, Math.round(breakdown.usdtHolding         ?? 0)),
    Math.min(255, Math.round(breakdown.usdcHolding         ?? 0)),
    Math.min(255, Math.round(breakdown.accountComplexity   ?? 0)),
  ];

  console.log(`[v3] Recording breakdown on-chain for ${wallet}: [${bd.join(', ')}]`);
  const tx = await contract.recordBreakdown(wallet, bd);
  await tx.wait();
  console.log(`[v3] ✅ Breakdown recorded — tx: ${tx.hash}`);
}

// ─────────────────────────────────────────────────────────────────────────────

// ── GET /score/leaderboard ─────────────────────────────────────────────────
// Returns top 10 wallets by highest score + aggregate stats.
// Public endpoint — no auth required.
scoreRouter.get('/leaderboard', (_req: Request, res: Response) => {
  try {
    const entries      = getLeaderboard(10);
    const totalWallets = getTotalUniqueWallets();
    res.json({ success: true, entries, totalWallets });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: msg });
  }
});

// POST /score/:address
// ─────────────────────────────────────────────────────────────────────────────
scoreRouter.post('/:address', async (req: Request, res: Response) => {
  const raw = req.params.address;

  if (!ethers.isAddress(raw)) {
    res.status(400).json({ success: false, error: 'Invalid wallet address' });
    return;
  }

  const address = raw.toLowerCase();

  // ── Step 0: Contract pre-check — free, instant, no AI cost ─────────────────
  // Check score validity and cooldown BEFORE touching PAPI or Mistral.
  // This avoids burning API credits when the wallet doesn't need rescoring.
  try {
    const proxyAddress = process.env.SCORE_NFT_PROXY;
    if (proxyAddress) {
      const provider  = new ethers.JsonRpcProvider(RPC_URL, { chainId: CHAIN_ID, name: 'polkadot-testnet' });
      const contract  = new ethers.Contract(proxyAddress, SCORE_NFT_ABI, provider);

      const [scoreData, refreshAt] = await Promise.all([
        contract.getScore(address),
        contract.refreshAvailableAt(address),
      ]);

      const [score, , expiresAt, , isValid, exists] = scoreData;
      const refreshAvailable = Number(refreshAt);
      const nowSec           = Math.floor(Date.now() / 1_000);

      // Score exists, is still valid, AND cooldown has NOT passed yet → deny
      if (exists && isValid && refreshAvailable > nowSec) {
        const cooldownSec = refreshAvailable - nowSec;
        const cooldownMin = Math.ceil(cooldownSec / 60);
        const expDate     = new Date(Number(expiresAt) * 1_000).toLocaleDateString('en-GB', {
          day: '2-digit', month: 'short', year: 'numeric',
        });
        res.status(400).json({
          success:          false,
          code:             'SCORE_STILL_VALID',
          error:            `Your VeraScore (${Number(score)}) is still valid until ${expDate}. You can refresh in ${cooldownMin} minute${cooldownMin !== 1 ? 's' : ''}.`,
          score:            Number(score),
          expiresAt:        Number(expiresAt),
          refreshAvailableAt: refreshAvailable,
          cooldownSec,
        });
        return;
      }
    }
  } catch (preErr: unknown) {
    // Non-fatal — if the pre-check fails (RPC hiccup), continue with scoring
    const msg = preErr instanceof Error ? preErr.message : String(preErr);
    console.warn(`[score] ⚠️  Pre-check skipped (${msg}) — continuing with full score`);
  }

  // ── Rate limit ────────────────────────────────────────────────────────────
  const last = rateLimitMap.get(address);
  const now  = Date.now();
  if (last && now - last < RATE_LIMIT_MS) {
    const waitMin = Math.ceil((RATE_LIMIT_MS - (now - last)) / 60_000);
    const waitSec = Math.ceil((RATE_LIMIT_MS - (now - last)) / 1_000);
    res.status(429).json({
      success: false,
      error:   `Rate limited. Please wait ${waitMin} minute${waitMin !== 1 ? 's' : ''} before requesting again.`,
      waitSec,
    });
    return;
  }
  rateLimitMap.set(address, now);

  try {
    console.log(`[score] Stage 1: Reading chain data for ${address}...`);
    const chainData = await readWalletData(address);
    console.log(`[score] Stage 1 done. Nonce: ${chainData.nonce}, Balance: ${chainData.freeBalance}`);

    console.log(`[score] Stage 2: Scoring with Mistral AI...`);
    const scoreResult = await scoreWallet(chainData);
    console.log(`[score] Stage 2 done. Score: ${scoreResult.score}/1000`);

    console.log(`[score] Stage 3: Building EIP-712 signature...`);
    const payload = await buildSignedPayload(address, scoreResult, chainData);
    console.log(`[score] Stage 3 done. Nonce: ${payload.nonce}, Deadline: ${payload.deadline}`);

    res.json({ success: true, data: payload });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[score] ❌ Error for ${address}:`, err);
    rateLimitMap.delete(address); // allow immediate retry on error
    res.status(500).json({ success: false, error: msg });
  }
});

// ─────────────────────────────────────────────────────────────────────────────



// POST /score/:address/confirm
// ─────────────────────────────────────────────────────────────────────────────
scoreRouter.post('/:address/confirm', async (req: Request, res: Response) => {
  const raw = req.params.address;

  if (!ethers.isAddress(raw)) {
    res.status(400).json({ success: false, error: 'Invalid wallet address' });
    return;
  }

  const { txHash, score, breakdown } = req.body as {
    txHash:    string;
    score:     number;
    breakdown: Record<string, number>;
  };

  if (!txHash || typeof score !== 'number' || !breakdown) {
    res.status(400).json({ success: false, error: 'Missing required fields: txHash, score, breakdown' });
    return;
  }

  try {
    // 1. Save to SQLite
    saveScore(raw.toLowerCase(), score, breakdown, txHash);
    console.log(`[confirm] ✅ Saved score ${score} for ${raw} — tx: ${txHash}`);

    // 2. Record breakdown on-chain — fire-and-forget, never blocks response
    recordBreakdownOnChain(raw.toLowerCase(), breakdown).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[confirm] ⚠️  recordBreakdown failed (non-fatal): ${msg}`);
    });

    res.json({ success: true });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[confirm] ❌ Error:`, err);
    res.status(500).json({ success: false, error: msg });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /score/:address
// ─────────────────────────────────────────────────────────────────────────────
scoreRouter.get('/:address', async (req: Request, res: Response) => {
  const raw = req.params.address;

  if (!ethers.isAddress(raw)) {
    res.status(400).json({ success: false, error: 'Invalid wallet address' });
    return;
  }

  const address = raw.toLowerCase();

  try {
    const proxyAddress = process.env.SCORE_NFT_PROXY;
    if (!proxyAddress) throw new Error('SCORE_NFT_PROXY not set');

    const provider = new ethers.JsonRpcProvider(RPC_URL, { chainId: CHAIN_ID, name: 'polkadot-testnet' });
    const contract = new ethers.Contract(proxyAddress, SCORE_NFT_ABI, provider);

    const [scoreData, totalScoredRaw, refreshAt] = await Promise.all([
      contract.getScore(address),
      contract.totalScored(),
      contract.refreshAvailableAt(address),
    ]);

    const [score, issuedAt, expiresAt, dataHash, isValid, exists] = scoreData;
    const history     = getHistory(address);
    const totalScored = Number(totalScoredRaw);

    if (!exists) {
      res.json({ success: true, hasScore: false, address, totalScored, history });
      return;
    }

    res.json({
      success:            true,
      hasScore:           true,
      address,
      score:              Number(score),
      issuedAt:           Number(issuedAt),
      expiresAt:          Number(expiresAt),
      dataHash,
      isValid,
      refreshAvailableAt: Number(refreshAt),
      totalScored,
      history,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[lookup] ❌ Error:`, err);
    res.status(500).json({ success: false, error: msg });
  }
});

// ─────────────────────────────────────────────────────────────────────────────



// POST /score/:address/relay-mint
// Gasless relay: backend calls mintScore on behalf of the user.
// The user signs a free personal_sign auth message (zero gas) to authorize.
// The backend (issuer wallet) submits the tx and pays PAS gas.
// Use case: wallets with USDT but no PAS for gas.
// ─────────────────────────────────────────────────────────────────────────────
scoreRouter.post('/:address/relay-mint', async (req: Request, res: Response) => {
  const raw = req.params.address;

  if (!ethers.isAddress(raw)) {
    res.status(400).json({ success: false, error: 'Invalid wallet address' });
    return;
  }

  const address = raw.toLowerCase() as `0x${string}`;

  const { score, dataHash, deadline, signature, userAuthSig } = req.body as {
    score:       number;
    dataHash:    string;
    deadline:    number;
    signature:   string;
    userAuthSig: string; // personal_sign from the user authorizing this relay
  };

  if (!score || !dataHash || !deadline || !signature || !userAuthSig) {
    res.status(400).json({ success: false, error: 'Missing required fields: score, dataHash, deadline, signature, userAuthSig' });
    return;
  }

  try {
    // ── Verify the user actually authorized this relay ──────────────────────
    // The auth message must be signed by the wallet address being scored.
    // This prevents anyone from triggering a relay on behalf of arbitrary addresses.
    const authMessage = `VeraScore relay mint authorized\nWallet: ${address}\nDeadline: ${deadline}`;
    const recovered   = ethers.verifyMessage(authMessage, userAuthSig).toLowerCase();

    if (recovered !== address) {
      console.warn(`[relay] Auth sig mismatch — expected ${address}, got ${recovered}`);
      res.status(403).json({ success: false, error: 'Authorization signature does not match wallet address' });
      return;
    }

    console.log(`[relay] ✅ Auth verified for ${address}`);

    // ── Call mintScore using the issuer wallet (backend pays gas) ───────────
    const privateKey   = process.env.ISSUER_PRIVATE_KEY;
    const proxyAddress = process.env.SCORE_NFT_PROXY;

    if (!privateKey || !proxyAddress) {
      res.status(500).json({ success: false, error: 'Relay not configured — ISSUER_PRIVATE_KEY or SCORE_NFT_PROXY missing' });
      return;
    }

    const provider     = new ethers.JsonRpcProvider(RPC_URL, { chainId: CHAIN_ID, name: 'polkadot-testnet' });
    const issuerWallet = new ethers.Wallet(privateKey, provider);

    const MINT_ABI = [
      'function mintScore(address wallet, uint16 score, bytes32 dataHash, uint256 deadline, bytes calldata signature) external',
    ];
    const contract = new ethers.Contract(proxyAddress, MINT_ABI, issuerWallet);

    console.log(`[relay] Submitting mintScore for ${address} — score: ${score}, deadline: ${deadline}`);
    const tx = await contract.mintScore(address, score, dataHash, deadline, signature);
    console.log(`[relay] Tx submitted: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`[relay] ✅ Confirmed in block ${receipt.blockNumber} — tx: ${tx.hash}`);

    // ── Save to history ──────────────────────────────────────────────────────
    // breakdown not available here — will be empty. Frontend can call /confirm after.
    saveScore(address, score, {}, tx.hash);

    res.json({ success: true, txHash: tx.hash });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[relay] ❌ Error:`, err);
    res.status(500).json({ success: false, error: msg });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /score/history/:address
// ─────────────────────────────────────────────────────────────────────────────
scoreRouter.get('/history/:address', async (req: Request, res: Response) => {
  const raw = req.params.address;

  if (!ethers.isAddress(raw)) {
    res.status(400).json({ success: false, error: 'Invalid wallet address' });
    return;
  }

  try {
    const history = getHistory(raw.toLowerCase());
    res.json({ success: true, history });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: msg });
  }
});