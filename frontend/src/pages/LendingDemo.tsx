import { useState, useEffect, useCallback, useRef }  from 'react';
import {
  useAccount, useReadContract, useWriteContract,
  useWaitForTransactionReceipt, useBalance, useSwitchChain, useChainId,
} from 'wagmi';
import { parseEther, formatEther }            from 'viem';
import { pasTestnet }                         from '../utils/wagmi.js';

// ── Contract config ───────────────────────────────────────────────────────────

const LENDING_POOL = (import.meta.env.VITE_LENDING_POOL ?? '') as `0x${string}`;

const POOL_ABI = [
  {
    name: 'deposit', type: 'function', stateMutability: 'payable',
    inputs: [], outputs: [],
  },
  {
    name: 'borrow', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }], outputs: [],
  },
  {
    name: 'repay', type: 'function', stateMutability: 'payable',
    inputs: [], outputs: [],
  },
  {
    name: 'withdraw', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }], outputs: [],
  },
  {
    name: 'liquidate', type: 'function', stateMutability: 'payable',
    inputs: [{ name: 'borrower', type: 'address' }], outputs: [],
  },
  {
    name: 'getPosition', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'borrower', type: 'address' }],
    outputs: [
      { name: 'collateral',      type: 'uint256' },
      { name: 'principal',       type: 'uint256' },
      { name: 'interestAccrued', type: 'uint256' },
      { name: 'totalDebt',       type: 'uint256' },
      { name: 'healthFactor',    type: 'uint256' },
      { name: 'ltvBps',          type: 'uint16'  },
      { name: 'liqThreshBps',    type: 'uint16'  },
      { name: 'aprBps',          type: 'uint16'  },
      { name: 'active',          type: 'bool'    },
    ],
  },
  {
    name: 'poolLiquidity', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }],
  },
  {
    name: 'totalCollateral', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }],
  },
  {
    name: 'totalBorrowed', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }],
  },
  {
    name: 'withdrawableCollateral', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'borrower', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface PositionData {
  collateral:      bigint;
  principal:       bigint;
  interestAccrued: bigint;
  totalDebt:       bigint;
  healthFactor:    bigint;
  ltvBps:          number;
  liqThreshBps:    number;
  aprBps:          number;
  active:          boolean;
}

interface PoolStats {
  success:         boolean;
  liquidity:       string;
  liquidityWei:    string;
  totalCollateral: string;
  totalBorrowed:   string;
  utilisationPct:  string;
  minCollateral:   string;
  minBorrow:       string;
}

interface SimResult {
  success:             boolean;
  hasScore:            boolean;
  score:               number | null;
  isValid:             boolean;
  scoreExpires:        number | null;
  // simulate endpoint returns these as top-level flat fields
  tier?:               string;          // e.g. "fair"
  label?:              string;          // e.g. "Fair"
  ltvPct?:             number;          // e.g. 60
  liqThreshPct?:       number;
  aprPct?:             number;
  eligible?:           boolean;
  collateralRequired?: number;
  deniedReason?:       string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MAX_HF = BigInt('0x' + 'f'.repeat(64));

function fmtPas(wei: bigint, dp = 6): string {
  const v = parseFloat(formatEther(wei));
  if (v === 0) return '0';
  if (v < 0.000001) return '<0.000001';
  return v.toFixed(dp).replace(/\.?0+$/, '');
}

function fmtHF(hf: bigint): string {
  if (hf === MAX_HF) return '∞';
  const v = parseFloat(formatEther(hf));
  return v.toFixed(3);
}

function hfColor(hf: bigint): string {
  if (hf === MAX_HF) return 'text-gray-400';
  const v = parseFloat(formatEther(hf));
  if (v >= 2)   return 'text-green-400';
  if (v >= 1.2) return 'text-yellow-400';
  if (v >= 1)   return 'text-orange-400';
  return 'text-red-400';
}

function tierColor(tier: string): string {
  return tier === 'excellent' ? 'text-green-400'
       : tier === 'good'      ? 'text-yellow-400'
       : tier === 'fair'      ? 'text-orange-400'
       :                        'text-red-400';
}

function tierBorder(tier: string): string {
  return tier === 'excellent' ? 'border-green-800'
       : tier === 'good'      ? 'border-yellow-800'
       : tier === 'fair'      ? 'border-orange-800'
       :                        'border-red-800';
}

function fmt(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
    </svg>
  );
}

// ── Action hook (writeContract + receipt + error handling) ────────────────────

type ActionStatus = 'idle' | 'signing' | 'mining' | 'done' | 'error';

function usePoolAction(onSuccess: () => void) {
  const [status, setStatus] = useState<ActionStatus>('idle');
  const [txError, setTxError] = useState<string | null>(null);
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>(undefined);

  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync }   = useSwitchChain();
  const chainId                = useChainId();

  const { isSuccess, isError, error: receiptError } = useWaitForTransactionReceipt({
    hash: pendingHash,
    confirmations: 1,
    pollingInterval: 3_000,
  });

  useEffect(() => {
    if (!pendingHash) return;
    if (isSuccess) {
      setStatus('done');
      setPendingHash(undefined);
      setTimeout(onSuccess, 500); // let the chain state settle
    }
    if (isError) {
      setStatus('error');
      setTxError(receiptError?.message ?? 'Transaction failed');
      setPendingHash(undefined);
    }
  }, [isSuccess, isError, pendingHash, onSuccess, receiptError]);

  // Explicit interface avoids wagmi's per-function conditional-type narrowing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const execute = useCallback(async (args: any) => {
    setStatus('signing');
    setTxError(null);
    try {
      // If wallet is on wrong chain, try to switch first
      if (chainId !== pasTestnet.id) {
        try {
          await switchChainAsync({ chainId: pasTestnet.id });
        } catch (switchErr: unknown) {
          const switchMsg = (switchErr as Error)?.message ?? '';
          // Chain not added to MetaMask yet — add it manually via window.ethereum
          if (switchMsg.includes('Unrecognized chain') || switchMsg.includes('4902') || switchMsg.includes('not been added')) {
            await (window as any).ethereum?.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId:           '0x' + pasTestnet.id.toString(16),
                chainName:         pasTestnet.name,
                nativeCurrency:    pasTestnet.nativeCurrency,
                rpcUrls:           [pasTestnet.rpcUrls.default.http[0]],
                blockExplorerUrls: [pasTestnet.blockExplorers.default.url],
              }],
            });
          } else {
            throw switchErr;
          }
        }
        // After switch/add — verify we are actually on the right chain now
        const currentChainId = await (window as any).ethereum?.request({ method: 'eth_chainId' });
        const currentId = parseInt(currentChainId, 16);
        if (currentId !== pasTestnet.id) {
          setTxError(`Please switch MetaMask to ${pasTestnet.name} (Chain ID ${pasTestnet.id}) before transacting.`);
          setStatus('error');
          return;
        }
      }
      const hash = await writeContractAsync(args);
      setPendingHash(hash);
      setStatus('mining');
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? 'Unknown error';
      setTxError(
        msg.includes('User rejected') ? 'Transaction rejected in wallet'
        : msg.includes('insufficient') ? 'Insufficient PAS balance'
        : msg.length > 120 ? msg.slice(0, 120) + '…'
        : msg
      );
      setStatus('error');
    }
  }, [writeContractAsync, switchChainAsync, chainId]);

  const reset = useCallback(() => {
    setStatus('idle');
    setTxError(null);
    setPendingHash(undefined);
  }, []);

  return { status, txError, execute, reset };
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function ActionFeedback({ status, txError }: { status: ActionStatus; txError: string | null }) {
  if (status === 'idle') return null;
  if (status === 'signing') return (
    <div className="flex items-center gap-2 text-xs text-yellow-300 bg-yellow-950 border border-yellow-800 rounded-xl px-3 py-2">
      <Spinner /> Check MetaMask to confirm…
    </div>
  );
  if (status === 'mining') return (
    <div className="flex items-center gap-2 text-xs text-blue-300 bg-blue-950 border border-blue-800 rounded-xl px-3 py-2">
      <Spinner /> Mining…
    </div>
  );
  if (status === 'done') return (
    <div className="text-xs text-green-300 bg-green-950 border border-green-800 rounded-xl px-3 py-2">✓ Transaction confirmed</div>
  );
  if (status === 'error') return (
    <div className="text-xs text-red-400 bg-red-950 border border-red-800 rounded-xl px-3 py-2">⚠ {txError}</div>
  );
  return null;
}

// ── HealthBar ─────────────────────────────────────────────────────────────────

function HealthBar({ hf, liqThreshBps }: { hf: bigint; liqThreshBps: number }) {
  if (hf === MAX_HF) return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-gray-500">
        <span>Health Factor</span><span>—</span>
      </div>
      <div className="h-2 bg-polkadot-border rounded-full" />
      <div className="text-xs text-gray-600 text-center">No active debt</div>
    </div>
  );

  const hfVal = parseFloat(formatEther(hf));
  const liqHF = 10000 / liqThreshBps; // HF at liquidation: collateral/collateral*(liqThresh) = 1/liqThresh
  // clamp display to 0–3 range
  const pct   = Math.min(100, (hfVal / 3) * 100);
  const color = hfVal >= 2 ? 'bg-green-500' : hfVal >= 1.2 ? 'bg-yellow-500' : hfVal >= 1 ? 'bg-orange-500' : 'bg-red-500';

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-gray-500">Health Factor</span>
        <span className={hfColor(hf) + ' font-mono font-bold'}>{fmtHF(hf)}</span>
      </div>
      <div className="h-2 bg-polkadot-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-gray-600">
        <span>Liquidation at &lt;{liqHF.toFixed(2)}</span>
        <span className={hfVal < liqHF + 0.1 ? 'text-red-400 font-semibold' : ''}>
          {hfVal < 1 ? '⚠ LIQUIDATABLE' : hfVal < liqHF + 0.1 ? '⚠ Approaching liq.' : 'Safe'}
        </span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const TIERS = [
  { label: 'Excellent', range: '750–1100', ltv: '90%', liq: '95%', apr: '5%',  color: 'text-green-400',  border: 'border-green-800' },
  { label: 'Good',      range: '500–749',  ltv: '75%', liq: '80%', apr: '8%',  color: 'text-yellow-400', border: 'border-yellow-800' },
  { label: 'Fair',      range: '250–499',  ltv: '60%', liq: '65%', apr: '12%', color: 'text-orange-400', border: 'border-orange-800' },
  { label: 'Denied',    range: '0–249',    ltv: '—',   liq: '—',   apr: '—',   color: 'text-red-400',    border: 'border-red-800'    },
];

export function LendingDemo() {
  const { address, isConnected } = useAccount();
  const chainIdComp                      = useChainId();
  const { switchChain: switchChainComp } = useSwitchChain();
  const isWrongNetwork = isConnected && chainIdComp !== pasTestnet.id;

  async function addAndSwitchToPAS() {
    try {
      await (window as any).ethereum?.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId:           '0x' + pasTestnet.id.toString(16),
          chainName:         pasTestnet.name,
          nativeCurrency:    pasTestnet.nativeCurrency,
          rpcUrls:           [pasTestnet.rpcUrls.default.http[0]],
          blockExplorerUrls: [pasTestnet.blockExplorers.default.url],
        }],
      });
    } catch {
      switchChainComp({ chainId: pasTestnet.id });
    }
  }

  // Inputs
  const [depositInput,  setDepositInput]  = useState('0.1');
  const [borrowInput,   setBorrowInput]   = useState('0.05');
  const [repayInput,    setRepayInput]    = useState('');
  const [withdrawInput, setWithdrawInput] = useState('');
  const [liqTarget,      setLiqTarget]      = useState('');
  const [liqTargetDebt,  setLiqTargetDebt]  = useState<bigint>(0n);
  const [liqLookingUp,   setLiqLookingUp]   = useState(false);
  const [liqStatus, setLiqStatus] = useState<
    | null
    | { ok: true;  debt: bigint }
    | { ok: false; reason: 'NoPosition' | 'NoDebt' | 'Healthy' | 'ScoreValid'; detail: string }
  >(null);
  // Cancel token: prevents stale async responses from overwriting state
  // after the user has already cleared or changed the input field.
  const liqFetchId = useRef(0);

  // Pool stats from backend
  const [poolStats, setPoolStats] = useState<PoolStats | null>(null);
  const [simResult, setSimResult] = useState<SimResult | null>(null);

  // Contract reads
  const { data: posRaw, refetch: refetchPos } = useReadContract({
    address: LENDING_POOL,
    abi: POOL_ABI,
    functionName: 'getPosition',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: {
      enabled: !!address && !!LENDING_POOL,
      refetchInterval: 12_000,
    },
  });

  const { data: poolLiqRaw, refetch: refetchLiq } = useReadContract({
    address: LENDING_POOL,
    abi: POOL_ABI,
    functionName: 'poolLiquidity',
    query: { enabled: !!LENDING_POOL, refetchInterval: 12_000 },
  });

  const { data: withdrawableRaw, refetch: refetchWithdrawable } = useReadContract({
    address: LENDING_POOL,
    abi: POOL_ABI,
    functionName: 'withdrawableCollateral',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: {
      enabled: !!address && !!LENDING_POOL,
      refetchInterval: 12_000,
    },
  });

  const { data: walletBalance } = useBalance({
    address,
    chainId: pasTestnet.id,
    query: { refetchInterval: 10_000 },
  });

  // Parse position
  const pos: PositionData | null = posRaw ? {
    collateral:      (posRaw as readonly bigint[])[0] as bigint,
    principal:       (posRaw as readonly bigint[])[1] as bigint,
    interestAccrued: (posRaw as readonly bigint[])[2] as bigint,
    totalDebt:       (posRaw as readonly bigint[])[3] as bigint,
    healthFactor:    (posRaw as readonly bigint[])[4] as bigint,
    ltvBps:          Number((posRaw as readonly unknown[])[5]),
    liqThreshBps:    Number((posRaw as readonly unknown[])[6]),
    aprBps:          Number((posRaw as readonly unknown[])[7]),
    active:          Boolean((posRaw as readonly unknown[])[8]),
  } : null;

  // Treat sub-100-wei as zero — prevents the Repay section showing after a
  // full repay when 1–2 wei of interest accrues between the tx and the refetch.
  const DUST = 100n;
  const effectiveDebt = pos ? (pos.totalDebt <= DUST ? 0n : pos.totalDebt) : 0n;

  // Refetch everything after a transaction
  // Refresh pool stats (called after every tx via refetchAll)
  const refetchPoolStats = useCallback(() => {
    fetch('/lending/pool')
      .then(r => r.json()).then(setPoolStats).catch(() => {});
  }, []);

  const refetchAll = useCallback(() => {
    refetchPos();
    refetchLiq();
    refetchWithdrawable();
    refetchPoolStats();
  }, [refetchPos, refetchLiq, refetchWithdrawable, refetchPoolStats]);

  // ── Reset all local state when wallet changes ─────────────────────────────
  const prevLendAddr = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevLendAddr.current !== undefined && prevLendAddr.current !== address) {
      setDepositInput('0.1');
      setBorrowInput('0.05');
      setRepayInput('');
      setWithdrawInput('');
      setLiqTarget('');
      setLiqTargetDebt(0n);
      setLiqStatus(null);
      setSimResult(null);
    }
    prevLendAddr.current = address;
  }, [address]);

  // Actions
  const depositAction  = usePoolAction(refetchAll);
  const borrowAction   = usePoolAction(refetchAll);
  const repayAction    = usePoolAction(refetchAll);
  const withdrawAction = usePoolAction(refetchAll);
  const liqAction      = usePoolAction(refetchAll);

  // Fetch pool stats + simulate on mount / address change
  useEffect(() => {
    fetch('/lending/pool')
      .then(r => r.json()).then(setPoolStats).catch(() => {});
    if (address) {
      fetch(`/lending/simulate/${address}?amount=1000`)
        .then(r => r.json()).then(setSimResult).catch(() => {});
    }
  }, [address]);

  // ── Handlers ────────────────────────────────────────────────────────────────

// ── Gas limits: explicit values bypass MetaMask's estimation on custom chains.
// Measured on PAS TestNet + 50% buffer for safety. Unused gas is refunded.
const GAS = {
  deposit:   120_000n,
  borrow:    180_000n,
  repay:     180_000n,
  withdraw:  150_000n,
  liquidate: 250_000n,
} as const;

function handleDeposit() {
    if (!address) return;
    depositAction.reset();
    depositAction.execute({
      address: LENDING_POOL,
      abi: POOL_ABI,
      functionName: 'deposit',
      value: parseEther(depositInput || '0'),
      gas: GAS.deposit,
    });
  }

  function handleBorrow() {
    if (!address) return;
    borrowAction.reset();
    borrowAction.execute({
      address: LENDING_POOL,
      abi: POOL_ABI,
      functionName: 'borrow',
      args: [parseEther(borrowInput || '0')],
      gas: GAS.borrow,
    });
  }

  function handleRepay() {
    if (!address) return;
    repayAction.reset();
    const base = repayInput
      ? parseEther(repayInput)
      : effectiveDebt;
    // Buffer covers interest that accrues between position fetch and tx execution.
    // Contract refunds any excess automatically via _send(msg.sender, excess).
    const INTEREST_BUFFER = 1_000_000_000_000_000n; // 0.001 PAS
    const amount = repayInput ? base : base + INTEREST_BUFFER;
    repayAction.execute({
      address: LENDING_POOL,
      abi: POOL_ABI,
      functionName: 'repay',
      value: amount,
      gas: GAS.repay,
    });
  }

  function handleWithdraw() {
    if (!address) return;
    withdrawAction.reset();
    withdrawAction.execute({
      address: LENDING_POOL,
      abi: POOL_ABI,
      functionName: 'withdraw',
      args: [parseEther(withdrawInput || '0')],
      gas: GAS.withdraw,
    });
  }

  async function handleLiquidate() {
    if (!address || !liqTarget) return;
    if (!liqTarget.startsWith('0x') || liqTarget.length !== 42) return;
    liqAction.reset();
    setLiqLookingUp(true);
    let debt = liqTargetDebt;
    try {
      // Re-fetch the target's position from backend to get fresh debt
      const r    = await fetch(`/lending/position/${liqTarget}`);
      const data = await r.json() as { success: boolean; totalDebtWei?: string };
      if (data.success && data.totalDebtWei) {
        debt = BigInt(data.totalDebtWei);
        setLiqTargetDebt(debt);
      }
    } catch (_) { /* use stale value */ }
    setLiqLookingUp(false);
    if (debt === 0n) {
      liqAction.reset();
      return;
    }
    liqAction.execute({
      address: LENDING_POOL,
      abi: POOL_ABI,
      functionName: 'liquidate',
      args: [liqTarget as `0x${string}`],
      // Add 0.001 PAS buffer: interest accrues between fetch and tx execution.
      // liquidate() refunds any msg.value above the actual debt automatically.
      value: debt + 1_000_000_000_000_000n,
      gas: GAS.liquidate,
    });
  }

  async function lookupLiqTarget(addr: string) {
    setLiqTarget(addr);
    setLiqTargetDebt(0n);
    setLiqStatus(null);

    if (!addr.startsWith('0x') || addr.length !== 42) return;

    // Cancel token: increment so any in-flight fetch from prior keystrokes
    // can detect they're stale and discard their result.
    const fetchId = ++liqFetchId.current;
    setLiqLookingUp(true);
    try {
      const r    = await fetch(`/lending/position/${addr}`);
      if (fetchId !== liqFetchId.current) return; // stale

      const data = await r.json() as {
        success:        boolean;
        active?:        boolean;
        totalDebtWei?:  string;
        collateralWei?: string;
        liqThreshBps?:  number;
        scoreValid?:    boolean;
        scoreExpires?:  number;
      };
      if (fetchId !== liqFetchId.current) return; // stale

      if (!data.success || !data.active) {
        setLiqStatus({ ok: false, reason: 'NoPosition', detail: 'No active position found for this address.' });
        return;
      }

      const debt      = BigInt(data.totalDebtWei   ?? '0');
      const col       = BigInt(data.collateralWei  ?? '0');
      const bps       = BigInt(data.liqThreshBps   ?? 6500);
      const threshold = (col * bps) / 10000n;

      if (debt === 0n) {
        setLiqStatus({ ok: false, reason: 'NoDebt', detail: 'Position has zero debt — nothing to liquidate.' });
        return;
      }

      const scoreGone  = !data.scoreValid;
      const overThresh = debt > threshold;

      if (scoreGone || overThresh) {
        setLiqTargetDebt(debt);
        setLiqStatus({ ok: true, debt });
        return;
      }

      // Healthy — explain with countdown
      const now      = Math.floor(Date.now() / 1000);
      const secsLeft = (data.scoreExpires ?? 0) - now;
      const minsLeft = Math.ceil(secsLeft / 60);
      const detail   = secsLeft > 0
        ? `Score valid for ${minsLeft} more min${minsLeft !== 1 ? 's' : ''}. Liquidation unlocks when it expires.`
        : 'Position is healthy — debt is below the liquidation threshold.';
      setLiqStatus({ ok: false, reason: secsLeft > 0 ? 'ScoreValid' : 'Healthy', detail });
    } catch {
      if (fetchId !== liqFetchId.current) return;
      setLiqStatus({ ok: false, reason: 'NoPosition', detail: 'Could not reach server — is the backend running?' });
    } finally {
      if (fetchId === liqFetchId.current) setLiqLookingUp(false);
    }
  }

  const poolLiquidity = poolLiqRaw as bigint | undefined;
  const withdrawable  = withdrawableRaw as bigint | undefined;
  const tierStr       = simResult?.tier ?? 'denied';

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!LENDING_POOL) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-4">
        <div className="text-4xl">🏗️</div>
        <div className="text-gray-300 font-medium">Lending Pool Not Deployed</div>
        <div className="text-gray-500 text-sm">
          Run <code className="text-polkadot-pink bg-polkadot-dark px-2 py-0.5 rounded">npm run deploy:lending</code> in the contracts directory, then set <code className="text-polkadot-pink">VITE_LENDING_POOL</code> in your frontend <code>.env</code>.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-10 space-y-8">

      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 bg-polkadot-card border border-polkadot-border rounded-full px-4 py-1.5 text-xs text-gray-400 mb-2">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse" />
          Live On-Chain Lending
        </div>
        <h2 className="text-3xl font-bold">
          VeraScore <span className="text-polkadot-pink">Lending Pool</span>
        </h2>
        <p className="text-gray-400 text-sm max-w-xl mx-auto">
          Deposit PAS collateral and borrow against your VeraScore.
          LTV, interest rate, and liquidation threshold are all gated by your score.
        </p>
      </div>

      {/* Tier overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {TIERS.map(t => (
          <div key={t.label} className={`bg-polkadot-card border ${t.border} rounded-2xl p-4 text-center space-y-1.5`}>
            <div className={`text-sm font-semibold ${t.color}`}>{t.label}</div>
            <div className="text-gray-500 text-xs">{t.range}</div>
            <div className={`text-lg font-bold ${t.color}`}>{t.ltv}</div>
            <div className="text-gray-600 text-xs">Max LTV</div>
            <div className="grid grid-cols-2 gap-1 pt-1 border-t border-polkadot-border text-[10px]">
              <div className="text-gray-600">Liq. <span className={t.color}>{t.liq}</span></div>
              <div className="text-gray-600">APR <span className={t.color}>{t.apr}</span></div>
            </div>
          </div>
        ))}
      </div>

      {/* Pool stats bar */}
      {poolStats?.success && (
        <div className="bg-polkadot-card border border-polkadot-border rounded-2xl px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          {[
            ['Pool Liquidity',     poolStats.liquidity + ' PAS'],
            ['Total Collateral',   poolStats.totalCollateral + ' PAS'],
            ['Total Borrowed',     poolStats.totalBorrowed + ' PAS'],
            ['Utilisation',        poolStats.utilisationPct + '%'],
          ].map(([label, val]) => (
            <div key={label} className="text-center">
              <div className="text-gray-500 mb-0.5">{label}</div>
              <div className="text-white font-mono font-semibold">{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Wrong Network Banner ── */}
      {isWrongNetwork && (
        <div className="flex items-center justify-between bg-yellow-900/40 border border-yellow-500/50 rounded-xl px-5 py-3 text-sm">
          <span className="text-yellow-300 font-medium">
            ⚠️ Wrong network detected. Switch to <strong>Polkadot Hub TestNet</strong> to transact.
          </span>
          <button
            onClick={addAndSwitchToPAS}
            className="ml-4 shrink-0 bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-4 py-1.5 rounded-lg text-xs transition"
          >
            Switch Network
          </button>
        </div>
      )}

      {!isConnected ? (
        <div className="bg-polkadot-card border border-polkadot-border rounded-2xl p-10 text-center space-y-3">
          <div className="text-4xl">🔐</div>
          <div className="text-gray-300 font-medium">Connect your wallet to use the lending pool</div>
          <div className="text-gray-500 text-sm">Click "Connect Wallet" in the top-right corner</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Left: Your Position ── */}
          <div className="space-y-4">
            <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-polkadot-border flex items-center justify-between">
                <div className="text-xs text-gray-500 uppercase tracking-widest">Your Position</div>
                {simResult?.score != null && (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${tierBorder(tierStr)} ${tierColor(tierStr)} bg-opacity-10`}>
                    {simResult.label ?? 'Denied'} · Score {simResult.score}
                  </span>
                )}
              </div>

              <div className="p-5 space-y-4">
                {/* Balance row */}
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500">Wallet Balance</span>
                  <span className="font-mono text-gray-300">
                    {walletBalance ? fmtPas(walletBalance.value) : '—'} PAS
                  </span>
                </div>

                {/* Position metrics */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['Collateral',   pos ? fmtPas(pos.collateral)      + ' PAS' : '—'],
                    ['Debt',         pos ? fmtPas(pos.totalDebt)        + ' PAS' : '—'],
                    ['Principal',    pos ? fmtPas(pos.principal)        + ' PAS' : '—'],
                    ['Interest',     pos ? fmtPas(pos.interestAccrued)  + ' PAS' : '—'],
                    ['LTV',          pos ? (pos.ltvBps / 100) + '%'             : '—'],
                    ['APR',          pos ? (pos.aprBps / 100) + '%'             : '—'],
                  ].map(([label, val]) => (
                    <div key={label} className="bg-polkadot-dark rounded-xl px-3 py-2.5 space-y-0.5">
                      <div className="text-[10px] text-gray-600 uppercase tracking-wider">{label}</div>
                      <div className="text-sm font-mono text-gray-200">{val}</div>
                    </div>
                  ))}
                </div>

                {/* Health factor */}
                {pos && pos.active && (
                  <HealthBar hf={pos.healthFactor} liqThreshBps={pos.liqThreshBps} />
                )}

                {/* Score status */}
                {simResult && (
                  <div className={`rounded-xl px-4 py-3 text-xs border ${
                    !simResult.hasScore      ? 'bg-gray-950 border-gray-800 text-gray-400'         :
                    !simResult.isValid       ? 'bg-red-950 border-red-800 text-red-400'            :
                    !simResult.eligible      ? 'bg-red-950 border-red-800 text-red-400'            :
                                               'bg-green-950 border-green-800 text-green-300'
                  }`}>
                    {!simResult.hasScore    ? '🔍 No VeraScore found — go to Score tab to generate one'    :
                     !simResult.isValid     ? '⏱ VeraScore expired — refresh to restore lending access'    :
                     !simResult.eligible    ? '✕ Score below 250 — build more on-chain history'             :
                     simResult.scoreExpires ? `✓ Score valid until ${fmt(simResult.scoreExpires)}` : '✓ Score valid'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Right: Actions ── */}
          <div className="space-y-4">

            {/* Deposit */}
            <div className="bg-polkadot-card border border-polkadot-border rounded-2xl p-5 space-y-3">
              <div className="text-xs text-gray-500 uppercase tracking-widest">Deposit Collateral</div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="number" min="0.001" step="0.01"
                    placeholder="0.1"
                    value={depositInput}
                    onChange={e => setDepositInput(e.target.value)}
                    className="w-full bg-polkadot-dark border border-polkadot-border rounded-xl px-4 py-3 pr-14 text-sm font-mono text-white focus:outline-none focus:border-polkadot-pink transition-colors"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">PAS</span>
                </div>
                <button
                  onClick={handleDeposit}
                  disabled={depositAction.status === 'signing' || depositAction.status === 'mining' || !simResult?.eligible}
                  className="bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-3 rounded-xl transition-colors text-sm"
                >
                  {depositAction.status === 'signing' || depositAction.status === 'mining' ? <Spinner /> : 'Deposit'}
                </button>
              </div>
              <ActionFeedback status={depositAction.status} txError={depositAction.txError} />
              {poolLiquidity !== undefined && (
                <div className="text-xs text-gray-600">Pool available: {fmtPas(poolLiquidity)} PAS</div>
              )}
            </div>

            {/* Borrow */}
            <div className="bg-polkadot-card border border-polkadot-border rounded-2xl p-5 space-y-3">
              <div className="text-xs text-gray-500 uppercase tracking-widest">Borrow</div>
              {simResult?.eligible && simResult.ltvPct != null && pos && (
                <div className="text-xs text-gray-500">
                  Max borrow on {fmtPas(pos.collateral)} PAS collateral:{' '}
                  <span className={`font-mono ${tierColor(tierStr)}`}>
                    {fmtPas(pos.collateral * BigInt(simResult.ltvPct) / 100n)} PAS
                  </span>
                </div>
              )}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="number" min="0.0001" step="0.01"
                    placeholder="0.05"
                    value={borrowInput}
                    onChange={e => setBorrowInput(e.target.value)}
                    className="w-full bg-polkadot-dark border border-polkadot-border rounded-xl px-4 py-3 pr-14 text-sm font-mono text-white focus:outline-none focus:border-polkadot-pink transition-colors"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">PAS</span>
                </div>
                <button
                  onClick={handleBorrow}
                  disabled={borrowAction.status === 'signing' || borrowAction.status === 'mining' || !simResult?.eligible || !pos?.active}
                  className="bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-3 rounded-xl transition-colors text-sm"
                >
                  {borrowAction.status === 'signing' || borrowAction.status === 'mining' ? <Spinner /> : 'Borrow'}
                </button>
              </div>
              <ActionFeedback status={borrowAction.status} txError={borrowAction.txError} />
            </div>

            {/* Repay */}
            <div className="bg-polkadot-card border border-polkadot-border rounded-2xl p-5 space-y-3">
              <div className="text-xs text-gray-500 uppercase tracking-widest">Repay</div>
              {pos?.active && effectiveDebt > 0n ? (
                <>
                  <div className="text-xs text-gray-500">
                    Outstanding debt: <span className="font-mono text-red-400">{fmtPas(effectiveDebt)} PAS</span>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number" min="0" step="0.001"
                        placeholder={fmtPas(effectiveDebt)}
                        value={repayInput}
                        onChange={e => setRepayInput(e.target.value)}
                        className="w-full bg-polkadot-dark border border-polkadot-border rounded-xl px-4 py-3 pr-14 text-sm font-mono text-white focus:outline-none focus:border-polkadot-pink transition-colors placeholder-gray-700"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">PAS</span>
                    </div>
                    <button
                      onClick={handleRepay}
                      disabled={repayAction.status === 'signing' || repayAction.status === 'mining'}
                      className="bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-3 rounded-xl transition-colors text-sm"
                    >
                      {repayAction.status === 'signing' || repayAction.status === 'mining' ? <Spinner /> : 'Repay'}
                    </button>
                  </div>
                  <div className="text-xs text-gray-600">Leave blank to repay full balance</div>
                  <ActionFeedback status={repayAction.status} txError={repayAction.txError} />
                </>
              ) : (
                <div className="text-xs text-gray-600 py-1">
                  {pos?.active ? 'No outstanding debt.' : 'No active position.'}
                </div>
              )}
            </div>

            {/* Withdraw */}
            <div className="bg-polkadot-card border border-polkadot-border rounded-2xl p-5 space-y-3">
              <div className="text-xs text-gray-500 uppercase tracking-widest">Withdraw Collateral</div>
              {pos?.active && withdrawable !== undefined && withdrawable > 0n ? (
                <>
                  <div className="text-xs text-gray-500">
                    Withdrawable: <span className="font-mono text-gray-300">{fmtPas(withdrawable)} PAS</span>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number" min="0" step="0.01"
                        placeholder={fmtPas(withdrawable)}
                        value={withdrawInput}
                        onChange={e => setWithdrawInput(e.target.value)}
                        className="w-full bg-polkadot-dark border border-polkadot-border rounded-xl px-4 py-3 pr-14 text-sm font-mono text-white focus:outline-none focus:border-polkadot-pink transition-colors placeholder-gray-700"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">PAS</span>
                    </div>
                    <button
                      onClick={handleWithdraw}
                      disabled={withdrawAction.status === 'signing' || withdrawAction.status === 'mining'}
                      className="bg-yellow-700 hover:bg-yellow-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-3 rounded-xl transition-colors text-sm"
                    >
                      {withdrawAction.status === 'signing' || withdrawAction.status === 'mining' ? <Spinner /> : 'Withdraw'}
                    </button>
                  </div>
                  <ActionFeedback status={withdrawAction.status} txError={withdrawAction.txError} />
                </>
              ) : (
                <div className="text-xs text-gray-600 py-1">
                  {!pos?.active
                    ? 'No active position.'
                    : 'No collateral available to withdraw — repay debt first.'}
                </div>
              )}
            </div>

            {/* Liquidate */}
            <div className="bg-polkadot-card border border-red-900 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500 uppercase tracking-widest">Liquidate a Position</div>
                <span className="text-xs text-red-500 border border-red-900 px-2 py-0.5 rounded-full">+5% bonus</span>
              </div>
              <div className="text-xs text-gray-600">
                Repay an unhealthy borrower's debt and receive their collateral + 5% bonus.
                Position must have expired score or debt above the liquidation threshold.
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="0x... borrower address"
                  value={liqTarget}
                  onChange={e => lookupLiqTarget(e.target.value)}
                  className="flex-1 bg-polkadot-dark border border-polkadot-border rounded-xl px-4 py-3 text-sm font-mono text-white focus:outline-none focus:border-red-600 transition-colors placeholder-gray-700"
                />
                <button
                  onClick={handleLiquidate}
                  disabled={liqAction.status === 'signing' || liqAction.status === 'mining' || liqLookingUp || !liqStatus || !liqStatus.ok}
                  className="bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-3 rounded-xl transition-colors text-sm"
                >
                  {liqAction.status === 'signing' || liqAction.status === 'mining' || liqLookingUp ? <Spinner /> : 'Liquidate'}
                </button>
              </div>

              {/* Eligibility status */}
              {liqTarget.length === 42 && liqTarget.startsWith('0x') && !liqLookingUp && liqStatus && (
                liqStatus.ok ? (
                  <div className="text-xs text-green-400 bg-green-950 border border-green-900 rounded-lg px-3 py-2 space-y-0.5">
                    <div className="font-semibold">✅ Liquidatable now</div>
                    <div>Debt: <span className="font-mono">{fmtPas(liqStatus.debt)} PAS</span> — this amount will be charged from your wallet</div>
                    <div className="text-green-600">You receive: collateral + 5% bonus</div>
                  </div>
                ) : liqStatus.reason === 'ScoreValid' ? (
                  <div className="text-xs text-yellow-400 bg-yellow-950 border border-yellow-900 rounded-lg px-3 py-2 space-y-0.5">
                    <div className="font-semibold">⏳ Not yet liquidatable</div>
                    <div>{liqStatus.detail}</div>
                  </div>
                ) : liqStatus.reason === 'Healthy' ? (
                  <div className="text-xs text-blue-400 bg-blue-950 border border-blue-900 rounded-lg px-3 py-2">
                    <div className="font-semibold">💙 Position is healthy</div>
                    <div>{liqStatus.detail}</div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 bg-polkadot-dark border border-polkadot-border rounded-lg px-3 py-2">
                    {liqStatus.detail}
                  </div>
                )
              )}
              <ActionFeedback status={liqAction.status} txError={liqAction.txError} />
            </div>

          </div>
        </div>
      )}

      {/* Contract link */}
      <div className="text-center text-xs text-gray-600 pt-2">
        Contract:{' '}
        <a
          href={`https://polkadot.testnet.routescan.io/address/${LENDING_POOL}`}
          target="_blank" rel="noopener noreferrer"
          className="font-mono text-gray-500 hover:text-polkadot-pink transition-colors"
        >
          {LENDING_POOL}↗
        </a>
      </div>
    </div>
  );
}