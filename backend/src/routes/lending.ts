import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';

export const lendingRouter = Router();

const RPC_URL = 'https://services.polkadothub-rpc.com/testnet';
const CHAIN_ID = 420420417;

const SCORE_NFT_ABI = [
  'function getScore(address wallet) external view returns (uint16 score, uint64 issuedAt, uint64 expiresAt, bytes32 dataHash, bool isValid, bool exists)',
];

const LENDING_POOL_ABI = [
  'function getPosition(address borrower) external view returns (uint256 collateral, uint256 principal, uint256 interestAccrued, uint256 totalDebt, uint256 healthFactor, uint16 ltvBps, uint16 liqThreshBps, uint16 aprBps, bool active)',
  'function poolLiquidity() external view returns (uint256)',
  'function totalCollateral() external view returns (uint256)',
  'function totalBorrowed() external view returns (uint256)',
  'function tierForScore(uint16 score) external view returns (uint16 ltvBps, uint16 liqThreshBps, uint16 aprBps, string label, bool eligible)',
  'function withdrawableCollateral(address borrower) external view returns (uint256)',
  'function MIN_COLLATERAL() external view returns (uint256)',
  'function MIN_BORROW() external view returns (uint256)',
];

function getProvider() {
  return new ethers.JsonRpcProvider(RPC_URL, { chainId: CHAIN_ID, name: 'polkadot-testnet' });
}

function getLendingContract(provider: ethers.JsonRpcProvider) {
  const addr = process.env.LENDING_POOL_ADDRESS;
  if (!addr) throw new Error('LENDING_POOL_ADDRESS not set in .env');
  return new ethers.Contract(addr, LENDING_POOL_ABI, provider);
}

function getScoreContract(provider: ethers.JsonRpcProvider) {
  const addr = process.env.SCORE_NFT_PROXY;
  if (!addr) throw new Error('SCORE_NFT_PROXY not set in .env');
  return new ethers.Contract(addr, SCORE_NFT_ABI, provider);
}

interface TierInfo {
  tier:          'excellent' | 'good' | 'fair' | 'denied';
  label:         string;
  ltvPct:        number;
  liqThreshPct:  number;
  aprPct:        number;
  maxBorrowUsd:  number;
  eligible:      boolean;
}

function tierFromScore(score: number): TierInfo {
  if (score >= 750) return { tier: 'excellent', label: 'Excellent', ltvPct: 90, liqThreshPct: 95, aprPct: 5,  maxBorrowUsd: 100_000, eligible: true };
  if (score >= 500) return { tier: 'good',      label: 'Good',      ltvPct: 75, liqThreshPct: 80, aprPct: 8,  maxBorrowUsd: 50_000,  eligible: true };
  if (score >= 250) return { tier: 'fair',       label: 'Fair',      ltvPct: 60, liqThreshPct: 65, aprPct: 12, maxBorrowUsd: 10_000,  eligible: true };
  return              { tier: 'denied',           label: 'Denied',    ltvPct: 0,  liqThreshPct: 0,  aprPct: 0,  maxBorrowUsd: 0,       eligible: false };
}

function fmt18(wei: bigint, decimals = 6): string {
  return parseFloat(ethers.formatEther(wei)).toFixed(decimals);
}

lendingRouter.get('/pool', async (_req: Request, res: Response) => {
  try {
    const provider  = getProvider();
    const pool      = getLendingContract(provider);

    const [liquidity, totalCol, totalBor, minCollateral, minBorrow] = await Promise.all([
      pool.poolLiquidity(),
      pool.totalCollateral(),
      pool.totalBorrowed(),
      pool.MIN_COLLATERAL(),
      pool.MIN_BORROW(),
    ]);

    const totalFunds    = (liquidity as bigint) + (totalCol as bigint);
    const utilisation   = totalFunds > 0n
      ? Number((totalBor as bigint) * 10000n / totalFunds) / 100
      : 0;

    res.json({
      success:         true,
      address:         process.env.LENDING_POOL_ADDRESS,
      liquidity:       fmt18(liquidity as bigint),
      liquidityWei:    (liquidity as bigint).toString(),
      totalCollateral: fmt18(totalCol as bigint),
      totalBorrowed:   fmt18(totalBor as bigint),
      utilisationPct:  utilisation.toFixed(2),
      minCollateral:   fmt18(minCollateral as bigint),
      minBorrow:       fmt18(minBorrow as bigint),
      tiers: [
        { tier: 'excellent', scoreMin: 750, ltvPct: 90, liqThreshPct: 95, aprPct: 5  },
        { tier: 'good',      scoreMin: 500, ltvPct: 75, liqThreshPct: 80, aprPct: 8  },
        { tier: 'fair',      scoreMin: 250, ltvPct: 60, liqThreshPct: 65, aprPct: 12 },
      ],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[lending/pool]', err);
    res.status(500).json({ success: false, error: msg });
  }
});

lendingRouter.get('/position/:address', async (req: Request, res: Response) => {
  const raw = req.params.address;
  if (!ethers.isAddress(raw)) {
    res.status(400).json({ success: false, error: 'Invalid wallet address' });
    return;
  }
  const address = raw.toLowerCase();

  try {
    const provider  = getProvider();
    const pool      = getLendingContract(provider);
    const scoreNft  = getScoreContract(provider);

    const [posData, scoreData, withdrawable] = await Promise.all([
      pool.getPosition(address),
      scoreNft.getScore(address),
      pool.withdrawableCollateral(address),
    ]);

    const [collateral, principal, interestAccrued, totalDebt, healthFactor, ltvBps, liqThreshBps, aprBps, active] = posData;
    const [score, issuedAt, expiresAt, , isValid, exists] = scoreData;

    const scoreNum   = Number(score);
    const tierInfo   = tierFromScore(scoreNum);
    const hfNum      = healthFactor === BigInt('0x' + 'f'.repeat(64))
      ? null
      : parseFloat(ethers.formatEther(healthFactor as bigint));

    res.json({
      success:       true,
      address,
      hasScore:      Boolean(exists),
      score:         exists ? scoreNum : null,
      scoreValid:    Boolean(isValid),
      isValid:       Boolean(isValid),
      scoreExpires:  exists ? Number(expiresAt) : null,
      tier:          tierInfo,
      active:        Boolean(active),
      collateral:    fmt18(collateral as bigint),
      collateralWei: (collateral as bigint).toString(),
      principal:     fmt18(principal as bigint),
      principalWei:  (principal as bigint).toString(),
      interest:      fmt18(interestAccrued as bigint),
      interestWei:   (interestAccrued as bigint).toString(),
      totalDebt:     fmt18(totalDebt as bigint),
      totalDebtWei:  (totalDebt as bigint).toString(),
      healthFactor:  hfNum,
      ltvBps:        Number(ltvBps),
      liqThreshBps:  Number(liqThreshBps),
      aprBps:        Number(aprBps),
      withdrawable:  fmt18(withdrawable as bigint),
      withdrawableWei: (withdrawable as bigint).toString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[lending/position] ${address}:`, err);
    res.status(500).json({ success: false, error: msg });
  }
});

lendingRouter.get('/simulate/:address', async (req: Request, res: Response) => {
  const raw = req.params.address;
  if (!ethers.isAddress(raw)) {
    res.status(400).json({ success: false, error: 'Invalid wallet address' });
    return;
  }

  const address      = raw.toLowerCase();
  const borrowAmount = Math.max(1, Math.min(1_000_000, parseFloat(req.query.amount as string) || 1000));

  try {
    const provider  = getProvider();
    const scoreNft  = getScoreContract(provider);
    const scoreData = await scoreNft.getScore(address);
    const [score, , expiresAt, , isValid, exists] = scoreData;

    if (!exists) {
      res.json({
        success: true, address, hasScore: false, score: null,
        isValid: false, expiresAt: null, borrowAmount,
        tier: 'no_score', eligible: false,
        deniedReason: 'No VeraScore found. Mint your score to unlock lending.',
      });
      return;
    }

    const scoreNum = Number(score);
    if (!isValid) {
      res.json({
        success: true, address, hasScore: true, score: scoreNum,
        isValid: false, expiresAt: Number(expiresAt), borrowAmount,
        tier: 'expired', eligible: false,
        deniedReason: 'VeraScore expired. Refresh your score to restore access.',
      });
      return;
    }

    const tierInfo = tierFromScore(scoreNum);
    if (!tierInfo.eligible) {
      res.json({
        success: true, address, hasScore: true, score: scoreNum,
        isValid: true, expiresAt: Number(expiresAt), borrowAmount,
        ...tierInfo, eligible: false,
        deniedReason: 'Score below 250. Build more on-chain history.',
      });
      return;
    }

    const collateralRequired = Math.ceil((borrowAmount * 100) / tierInfo.ltvPct);

    res.json({
      success:             true,
      address,
      hasScore:            true,
      score:               scoreNum,
      isValid:             true,
      expiresAt:           Number(expiresAt),
      borrowAmount,
      ...tierInfo,
      collateralRequired,
      deniedReason:        null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[lending/simulate] ${address}:`, err);
    res.status(500).json({ success: false, error: msg });
  }
});