import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { getHistory } from '../db/database.js';

export const verifyRouter = Router();

const RPC_URL = 'https://services.polkadothub-rpc.com/testnet';
const CHAIN_ID = 420420417;

const SCORE_NFT_ABI = [
  'function getScore(address wallet) external view returns (uint16 score, uint64 issuedAt, uint64 expiresAt, bytes32 dataHash, bool isValid, bool exists)',
  'function totalScored() external view returns (uint256)',
];

verifyRouter.get('/:address', async (req: Request, res: Response) => {
  const raw = req.params.address;
  if (!ethers.isAddress(raw)) {
    return res.status(400).json({ success: false, error: 'Invalid Ethereum address' });
  }

  const address = raw.toLowerCase();

  try {
    const proxyAddress = process.env.SCORE_NFT_PROXY;
    if (!proxyAddress) throw new Error('SCORE_NFT_PROXY not set in .env');

    const provider = new ethers.JsonRpcProvider(RPC_URL, {
      chainId: CHAIN_ID,
      name: 'polkadot-testnet',
    }, { staticNetwork: true });

    const contract = new ethers.Contract(proxyAddress, SCORE_NFT_ABI, provider);

    const [scoreData, totalScoredRaw] = await Promise.race([
      Promise.all([
        contract.getScore(address),
        contract.totalScored(),
      ]),
      new Promise<[any, any]>((_, reject) =>
        setTimeout(() => reject(new Error('RPC Timeout')), 5000)
      ),
    ]);

    const [score, issuedAt, expiresAt, dataHash, isValid, exists] = scoreData;
    const totalScored = Number(totalScoredRaw);
    const history = getHistory(address);
    const latestTx = history.length > 0 ? history[0].txHash : null;

    res.json({
      success: true,
      valid: Boolean(isValid && exists),
      address,
      score: exists ? Number(score) : null,
      issuedAt: exists ? Number(issuedAt) : null,
      expiresAt: exists ? Number(expiresAt) : null,
      txHash: latestTx,
      dataHash: exists ? dataHash : null,
      totalScored,
      protocol: 'VeraScore v2',
      contract: proxyAddress,
      network: 'PAS TestNet',
      chainId: CHAIN_ID,
    });

  } catch (err: any) {
    console.error(`[verify] ❌ Error:`, err.message);
    res.status(500).json({ success: false, error: "Contract call failed. Please ensure the proxy address is correct and the RPC is online." });
  }
});