import { Router, Request, Response } from 'express';
import { ethers }                    from 'ethers';
import { getHistory }                from '../db/database.js';

export const verifyRouter = Router();

const RPC_URL  = 'https://services.polkadothub-rpc.com/testnet';
const CHAIN_ID = 420420417;

// V2 read-only ABI — getScore returns all data needed for verification
const SCORE_NFT_ABI = [
  'function getScore(address wallet) external view returns (uint16 score, uint64 issuedAt, uint64 expiresAt, bytes32 dataHash, bool isValid, bool exists)',
  'function totalScored() external view returns (uint256)',
];

// ─────────────────────────────────────────────────────────────────────────────
// GET /verify/:address
//
// Public protocol integration endpoint.
// Any DeFi protocol can call this to verify a wallet's VeraScore WITHOUT
// reading the blockchain directly. Includes CORS * for cross-origin access.
//
// Response shape:
//   { valid, address, score, issuedAt, expiresAt, txHash, dataHash, totalScored }
//
// `valid` is the canonical single boolean: has score + not expired.
// `txHash` comes from SQLite history (the confirmed mint transaction).
// ─────────────────────────────────────────────────────────────────────────────
verifyRouter.get('/:address', async (req: Request, res: Response) => {
  const raw = req.params.address;

  if (!ethers.isAddress(raw)) {
    res.status(400).json({
      success: false,
      error:   'Invalid Ethereum address',
    });
    return;
  }

  const address = raw.toLowerCase();

  try {
    const proxyAddress = process.env.SCORE_NFT_PROXY;
    if (!proxyAddress) throw new Error('SCORE_NFT_PROXY not set in .env');

    const provider = new ethers.JsonRpcProvider(RPC_URL, {
      chainId: CHAIN_ID,
      name:    'polkadot-testnet',
    });
    const contract = new ethers.Contract(proxyAddress, SCORE_NFT_ABI, provider);

    const [scoreData, totalScoredRaw] = await Promise.all([
      contract.getScore(address),
      contract.totalScored(),
    ]);

    const [score, issuedAt, expiresAt, dataHash, isValid, exists] = scoreData;
    const totalScored = Number(totalScoredRaw);

    // No score minted yet
    if (!exists) {
      res.json({
        success:      true,
        valid:        false,
        address,
        score:        null,
        issuedAt:     null,
        expiresAt:    null,
        txHash:       null,
        dataHash:     null,
        totalScored,
        protocol:     'VeraScore v2',
        contract:     proxyAddress,
        network:      'PAS TestNet',
        chainId:      CHAIN_ID,
      });
      return;
    }

    // Get mint txHash from SQLite history (most recent entry for this address)
    const history = getHistory(address);
    const latestTx = history.length > 0 ? history[0].txHash : null;

    res.json({
      success:      true,
      valid:        Boolean(isValid),
      address,
      score:        Number(score),
      issuedAt:     Number(issuedAt),
      expiresAt:    Number(expiresAt),
      txHash:       latestTx,
      dataHash,
      totalScored,
      protocol:     'VeraScore v2',
      contract:     proxyAddress,
      network:      'PAS TestNet',
      chainId:      CHAIN_ID,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[verify] ❌ Error for ${address}:`, err);
    res.status(500).json({ success: false, error: msg });
  }
});