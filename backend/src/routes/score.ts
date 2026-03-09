import { Router, Request, Response } from 'express';
import { ethers }                    from 'ethers';
import { readWalletData }            from '../chain/papiReader.js';
import { scoreWallet }               from '../scoring/mistralScorer.js';
import { buildSignedPayload }        from '../scoring/signer.js';
import { saveScore, getHistory, getLeaderboard, getTotalUniqueWallets } from '../db/database.js';

export const scoreRouter = Router();

// Using the most stable RPC for reads to avoid the 20s hangs
const RPC_URL  = 'https://pas-rpc.stakeworld.io'; 
const CHAIN_ID = 420420417;

const SCORE_NFT_ABI = [
  'function getScore(address wallet) external view returns (uint16 score, uint64 issuedAt, uint64 expiresAt, bytes32 dataHash, bool isValid, bool exists)',
  'function totalScored() external view returns (uint256)',
  'function refreshAvailableAt(address wallet) external view returns (uint64)',
  'function recordBreakdown(address wallet, uint8[6] calldata bd) external',
];

const RATE_LIMIT_MS = 60 * 60 * 1_000; 
const rateLimitMap  = new Map<string, number>();

// ── V3: Record category breakdown on-chain ──────────────────
async function recordBreakdownOnChain(
  wallet:    string,
  breakdown: Record<string, number>,
): Promise<void> {
  const privateKey   = process.env.ISSUER_PRIVATE_KEY;
  const proxyAddress = process.env.SCORE_NFT_PROXY;
  if (!privateKey || !proxyAddress) return;

  // Added { staticNetwork: true } here
  const provider     = new ethers.JsonRpcProvider(RPC_URL, { chainId: CHAIN_ID, name: 'polkadot-testnet' }, { staticNetwork: true });
  const issuerWallet = new ethers.Wallet(privateKey, provider);
  const contract     = new ethers.Contract(proxyAddress, SCORE_NFT_ABI, issuerWallet);

  const bd: [number, number, number, number, number, number] = [
    Math.min(255, Math.round(breakdown.transactionActivity ?? 0)),
    Math.min(255, Math.round(breakdown.accountAge          ?? 0)),
    Math.min(255, Math.round(breakdown.nativeBalance       ?? 0)),
    Math.min(255, Math.round(breakdown.usdtHolding         ?? 0)),
    Math.min(255, Math.round(breakdown.usdcHolding         ?? 0)),
    Math.min(255, Math.round(breakdown.accountComplexity   ?? 0)),
  ];

  try {
    const tx = await contract.recordBreakdown(wallet, bd);
    await tx.wait();
    console.log(`[v3] ✅ Breakdown recorded: ${tx.hash}`);
  } catch (e) {
    console.warn('[v3] Breakdown record failed:', e);
  }
}

// ── GET /leaderboard ─────────────────────────────────────────────────
scoreRouter.get('/leaderboard', (_req: Request, res: Response) => {
  try {
    const entries      = getLeaderboard(10);
    const totalWallets = getTotalUniqueWallets();
    res.json({ success: true, entries, totalWallets });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /:address (The Main Scoring Logic) ──────────────────────────
scoreRouter.post('/:address', async (req: Request, res: Response) => {
  const raw = req.params.address;
  if (!ethers.isAddress(raw)) {
    return res.status(400).json({ success: false, error: 'Invalid wallet address' });
  }
  const address = raw.toLowerCase();

  // ── Step 0: Fast Contract Pre-check ──
  try {
    const proxyAddress = process.env.SCORE_NFT_PROXY;
    if (proxyAddress) {
      // Added { staticNetwork: true } here
      const provider = new ethers.JsonRpcProvider(RPC_URL, { chainId: CHAIN_ID, name: 'polkadot-testnet' }, { staticNetwork: true });
      const contract = new ethers.Contract(proxyAddress, SCORE_NFT_ABI, provider);

      const preCheck = await Promise.race([
        Promise.all([contract.getScore(address), contract.refreshAvailableAt(address)]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
      ]) as any;

      if (preCheck) {
        const [scoreData, refreshAt] = preCheck;
        const [score, , expiresAt, , isValid, exists] = scoreData;
        const refreshAvailable = Number(refreshAt);
        const nowSec = Math.floor(Date.now() / 1000);

        if (exists && isValid && refreshAvailable > nowSec) {
          const cooldownMin = Math.ceil((refreshAvailable - nowSec) / 60);
          return res.status(400).json({
            success: false,
            code: 'SCORE_STILL_VALID',
            error: `Score (${Number(score)}) is still valid. Refresh in ${cooldownMin} mins.`,
            score: Number(score),
            expiresAt: Number(expiresAt)
          });
        }
      }
    }
  } catch (e) {
    console.log('[score] ⚡ Skipping slow pre-check, going straight to PAPI');
  }

  const last = rateLimitMap.get(address);
  if (last && Date.now() - last < RATE_LIMIT_MS) {
    return res.status(429).json({ success: false, error: 'Rate limited. Try again in 1 hour.' });
  }
  rateLimitMap.set(address, Date.now());

  try {
    const chainData = await readWalletData(address);
    const scoreResult = await scoreWallet(chainData);
    const payload = await buildSignedPayload(address, scoreResult, chainData);
    res.json({ success: true, data: payload });
  } catch (err: any) {
    rateLimitMap.delete(address);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /:address/confirm ──────────────────────────────────────────
scoreRouter.post('/:address/confirm', async (req: Request, res: Response) => {
  const { txHash, score, breakdown } = req.body;
  if (!txHash || score === undefined) return res.status(400).json({ success: false, error: 'Missing data' });

  try {
    saveScore(req.params.address.toLowerCase(), score, breakdown, txHash);
    recordBreakdownOnChain(req.params.address.toLowerCase(), breakdown).catch(() => {});
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /:address (Fast Lookup) ─────────────────────────────────────
scoreRouter.get('/:address', async (req: Request, res: Response) => {
  const address = req.params.address.toLowerCase();
  try {
    const proxyAddress = process.env.SCORE_NFT_PROXY;
    // Added { staticNetwork: true } here
    const provider = new ethers.JsonRpcProvider(RPC_URL, { chainId: CHAIN_ID, name: 'polkadot-testnet' }, { staticNetwork: true });
    const contract = new ethers.Contract(proxyAddress!, SCORE_NFT_ABI, provider);

    const [scoreData, totalScoredRaw, refreshAt] = await Promise.all([
      contract.getScore(address),
      contract.totalScored(),
      contract.refreshAvailableAt(address),
    ]);

    const [score, issuedAt, expiresAt, dataHash, isValid, exists] = scoreData;
    
    res.json({
      success: true,
      hasScore: !!exists,
      address,
      score: Number(score),
      issuedAt: Number(issuedAt),
      expiresAt: Number(expiresAt),
      dataHash,
      isValid,
      refreshAvailableAt: Number(refreshAt),
      totalScored: Number(totalScoredRaw),
      history: getHistory(address)
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /:address/relay-mint (Gasless) ──────────────────────────────
scoreRouter.post('/:address/relay-mint', async (req: Request, res: Response) => {
  const address = req.params.address.toLowerCase();
  const { score, dataHash, deadline, signature, userAuthSig } = req.body;

  try {
    const authMessage = `VeraScore relay mint authorized\nWallet: ${address}\nDeadline: ${deadline}`;
    const recovered   = ethers.verifyMessage(authMessage, userAuthSig).toLowerCase();

    if (recovered !== address) {
      return res.status(403).json({ success: false, error: 'Auth sig mismatch' });
    }

    // Added { staticNetwork: true } here
    const provider     = new ethers.JsonRpcProvider(RPC_URL, { chainId: CHAIN_ID, name: 'polkadot-testnet' }, { staticNetwork: true });
    const issuerWallet = new ethers.Wallet(process.env.ISSUER_PRIVATE_KEY!, provider);
    const contract     = new ethers.Contract(process.env.SCORE_NFT_PROXY!, SCORE_NFT_ABI, issuerWallet);

    const tx = await contract.mintScore(address, score, dataHash, deadline, signature);
    await tx.wait();

    saveScore(address, score, {}, tx.hash);
    res.json({ success: true, txHash: tx.hash });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /history/:address ──────────────────────────────────────────
scoreRouter.get('/history/:address', (req: Request, res: Response) => {
  res.json({ success: true, history: getHistory(req.params.address.toLowerCase()) });
});
