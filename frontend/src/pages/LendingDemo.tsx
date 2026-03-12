import { useState, useEffect, useCallback, useRef } from 'react';
import {
  useAccount, useReadContract, useWriteContract,
  useWaitForTransactionReceipt, useBalance, useSwitchChain, useChainId,
} from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { pasTestnet }              from '../utils/wagmi.js';

const LENDING_POOL = (import.meta.env.VITE_LENDING_POOL ?? '') as `0x${string}`;
const EXPLORER     = 'https://polkadot.testnet.routescan.io';

const POOL_ABI = [
  { name: 'deposit',  type: 'function', stateMutability: 'payable',    inputs: [], outputs: [] },
  { name: 'borrow',   type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'repay',    type: 'function', stateMutability: 'payable',    inputs: [], outputs: [] },
  { name: 'withdraw', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'liquidate',type: 'function', stateMutability: 'payable',    inputs: [{ name: 'borrower', type: 'address' }], outputs: [] },
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
  { name: 'poolLiquidity',          type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'totalCollateral',        type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'totalBorrowed',          type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'withdrawableCollateral', type: 'function', stateMutability: 'view', inputs: [{ name: 'borrower', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

interface PositionData {
  collateral: bigint; principal: bigint; interestAccrued: bigint; totalDebt: bigint;
  healthFactor: bigint; ltvBps: number; liqThreshBps: number; aprBps: number; active: boolean;
}
interface PoolStats {
  success: boolean; liquidity: string; totalCollateral: string; totalBorrowed: string; utilisationPct: string;
}
interface SimResult {
  success: boolean; hasScore: boolean; score: number | null; isValid: boolean;
  scoreExpires: number | null; tier?: string; label?: string; ltvPct?: number;
  eligible?: boolean; deniedReason?: string;
}

const MAX_HF = BigInt('0x' + 'f'.repeat(64));
const DUST   = parseEther('0.0001');

const TIERS = [
  { label: 'Excellent', range: '800–1100', ltv: '90%', apr: '5%',  color: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/5'  },
  { label: 'Good',      range: '500–799',  ltv: '75%', apr: '8%',  color: 'text-yellow-400',  border: 'border-yellow-500/20',  bg: 'bg-yellow-500/5'   },
  { label: 'Fair',      range: '250–499',  ltv: '60%', apr: '12%', color: 'text-orange-400',  border: 'border-orange-500/20',  bg: 'bg-orange-500/5'   },
  { label: 'Denied',    range: '0–249',    ltv: '—',   apr: '—',   color: 'text-red-400',     border: 'border-red-500/20',     bg: 'bg-red-500/5'      },
];

const GAS = { deposit: 120_000n, borrow: 180_000n, repay: 180_000n, withdraw: 150_000n, liquidate: 250_000n };

function fmtPas(wei: bigint): string {
  const v = parseFloat(formatEther(wei));
  if (v === 0) return '0';
  if (v < 0.001) return '<0.001';
  return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
}
function fmtHF(hf: bigint): string {
  if (hf === MAX_HF) return '∞';
  return parseFloat(formatEther(hf)).toFixed(3);
}
function hfColor(hf: bigint): string {
  if (hf === MAX_HF) return 'text-gray-500';
  const v = parseFloat(formatEther(hf));
  if (v >= 2) return 'text-emerald-400';
  if (v >= 1.2) return 'text-yellow-400';
  return 'text-red-400';
}

// ── Action hook ────────────────────────────────────────────────────────────
type ActionStatus = 'idle' | 'signing' | 'mining' | 'done' | 'error';

function usePoolAction(onSuccess: () => void) {
  const [status,      setStatus]      = useState<ActionStatus>('idle');
  const [txError,     setTxError]     = useState<string | null>(null);
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>(undefined);
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync }   = useSwitchChain();
  const chainId                = useChainId();
  const { isSuccess, isError, error: receiptError } = useWaitForTransactionReceipt({ hash: pendingHash, confirmations: 1 });

  useEffect(() => {
    if (!pendingHash) return;
    if (isSuccess) { setStatus('done'); setPendingHash(undefined); setTimeout(onSuccess, 500); }
    if (isError)   { setStatus('error'); setTxError(receiptError?.message ?? 'Transaction failed'); setPendingHash(undefined); }
  }, [isSuccess, isError, pendingHash, onSuccess, receiptError]);

  const execute = useCallback(async (args: any) => {
    setStatus('signing'); setTxError(null);
    try {
      if (chainId !== pasTestnet.id) await switchChainAsync({ chainId: pasTestnet.id });
      const hash = await writeContractAsync(args);
      setPendingHash(hash); setStatus('mining');
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? '';
      setStatus('error');
      setTxError(msg.includes('User rejected') ? 'Rejected in wallet' : msg.slice(0, 120));
    }
  }, [writeContractAsync, switchChainAsync, chainId]);

  const reset = useCallback(() => { setStatus('idle'); setTxError(null); setPendingHash(undefined); }, []);
  return { status, txError, execute, reset };
}

function ActionFeedback({ status, txError }: { status: ActionStatus; txError: string | null }) {
  if (status === 'idle')    return null;
  if (status === 'signing') return <p className="text-[9px] font-bold text-yellow-400 animate-pulse uppercase tracking-widest">Check MetaMask…</p>;
  if (status === 'mining')  return <p className="text-[9px] font-bold text-blue-400 animate-pulse uppercase tracking-widest">Mining on Hub…</p>;
  if (status === 'done')    return <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest">✓ Confirmed</p>;
  if (status === 'error')   return <p className="text-[9px] font-bold text-red-400 uppercase tracking-widest break-words">✗ {txError}</p>;
  return null;
}

function HealthBar({ hf, liqThreshBps }: { hf: bigint; liqThreshBps: number }) {
  if (hf === MAX_HF) return (
    <div className="space-y-1">
      <div className="flex justify-between text-[8px] font-bold uppercase tracking-widest text-gray-600">
        <span>Health Factor</span><span>∞</span>
      </div>
      <div className="h-1 bg-black/40 rounded-full border border-white/5" />
    </div>
  );
  const hfVal = parseFloat(formatEther(hf));
  const pct   = Math.min(100, (hfVal / 3) * 100);
  const color = hfVal >= 2 ? 'bg-emerald-500' : hfVal >= 1.2 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[8px] font-bold uppercase tracking-widest">
        <span className="text-gray-600">Health Factor</span>
        <span className={`${hfColor(hf)} font-mono`}>{fmtHF(hf)}</span>
      </div>
      <div className="h-1 bg-black/40 rounded-full overflow-hidden border border-white/5">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[8px] text-gray-700 uppercase tracking-widest">
        Liquidation at {liqThreshBps / 100}% LTV · keep above 1.2
      </p>
    </div>
  );
}

// ── Action card ────────────────────────────────────────────────────────────
function ActionCard({ title, accent, children }: {
  title: string; accent?: string; children: React.ReactNode;
}) {
  return (
    <div className={`bg-polkadot-card border rounded-2xl overflow-hidden shadow-xl ${accent ?? 'border-polkadot-border'}`}>
      <div className="px-4 py-3 border-b border-polkadot-border bg-black/20">
        <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">{title}</span>
      </div>
      <div className="px-4 py-4 space-y-3">{children}</div>
    </div>
  );
}

function PasInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="relative">
      <input type="number" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? '0.00'}
        className="w-full bg-polkadot-dark border border-polkadot-border rounded-xl px-4 py-2.5 text-sm font-mono text-white outline-none focus:border-polkadot-pink/40 placeholder-gray-700" />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-gray-700 uppercase">PAS</span>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export function LendingDemo() {
  const { address, isConnected } = useAccount();
  const chainId                  = useChainId();
  const { switchChain }          = useSwitchChain();
  const isWrongNetwork           = isConnected && chainId !== pasTestnet.id;

  const [depositInput,  setDepositInput]  = useState('0.1');
  const [borrowInput,   setBorrowInput]   = useState('0.05');
  const [repayInput,    setRepayInput]    = useState('');
  const [withdrawInput, setWithdrawInput] = useState('');
  const [liqTarget,     setLiqTarget]     = useState('');
  const [liqTargetDebt, setLiqTargetDebt] = useState<bigint>(0n);
  const [liqLookingUp,  setLiqLookingUp]  = useState(false);
  const [liqStatus,     setLiqStatus]     = useState<{ ok: boolean; detail: string } | null>(null);
  const liqFetchId = useRef(0);

  const [poolStats,  setPoolStats]  = useState<PoolStats | null>(null);
  const [simResult,  setSimResult]  = useState<SimResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  const { data: posRaw, refetch: refetchPos } = useReadContract({
    address: LENDING_POOL, abi: POOL_ABI, functionName: 'getPosition',
    args:  [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: !!address, refetchInterval: 12_000 },
  });
  const { data: withdrawableRaw, refetch: refetchWithdrawable } = useReadContract({
    address: LENDING_POOL, abi: POOL_ABI, functionName: 'withdrawableCollateral',
    args:  [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: !!address, refetchInterval: 12_000 },
  });
  const { data: walletBalance } = useBalance({
    address, chainId: pasTestnet.id, query: { refetchInterval: 10_000 },
  });

  const pos: PositionData | null = posRaw ? {
    collateral:      (posRaw as any)[0], principal:       (posRaw as any)[1],
    interestAccrued: (posRaw as any)[2], totalDebt:       (posRaw as any)[3],
    healthFactor:    (posRaw as any)[4], ltvBps:          Number((posRaw as any)[5]),
    liqThreshBps:    Number((posRaw as any)[6]), aprBps:  Number((posRaw as any)[7]),
    active:          (posRaw as any)[8],
  } : null;

  const effectiveDebt      = pos ? (pos.totalDebt <= DUST ? 0n : pos.totalDebt) : 0n;
  const withdrawableAmount = withdrawableRaw ? (withdrawableRaw as bigint) : 0n;

  const refetchAll = useCallback(() => {
    refetchPos(); refetchWithdrawable();
    fetch('/lending/pool').then(r => r.json()).then(setPoolStats).catch(() => {});
    setRepayInput(''); setWithdrawInput('');
  }, [refetchPos, refetchWithdrawable]);

  const depositAction  = usePoolAction(refetchAll);
  const borrowAction   = usePoolAction(refetchAll);
  const repayAction    = usePoolAction(refetchAll);
  const withdrawAction = usePoolAction(refetchAll);
  const liqAction      = usePoolAction(refetchAll);

  useEffect(() => {
    fetch('/lending/pool').then(r => r.json()).then(setPoolStats).catch(() => {});
    if (address) {
      setSimLoading(true);
      fetch(`/lending/simulate/${address}?amount=1000`)
        .then(r => r.json())
        .then(data => { setSimResult(data); setSimLoading(false); })
        .catch(() => setSimLoading(false));
    }
  }, [address]);

  async function lookupLiqTarget(addr: string) {
    setLiqTarget(addr);
    if (addr.length !== 42) { setLiqStatus(null); return; }
    const fetchId = ++liqFetchId.current;
    setLiqLookingUp(true);
    try {
      const r    = await fetch(`/lending/position/${addr}`);
      const data = await r.json();
      if (fetchId !== liqFetchId.current) return;
      if (!data.success || !data.active) {
        setLiqStatus({ ok: false, detail: 'No active position found.' });
      } else {
        const debt = BigInt(data.totalDebtWei ?? '0');
        if (debt === 0n) {
          setLiqStatus({ ok: false, detail: 'Zero debt.' });
        } else if (!data.scoreValid || debt > (BigInt(data.collateralWei) * BigInt(data.liqThreshBps) / 10000n)) {
          setLiqTargetDebt(debt);
          setLiqStatus({ ok: true, detail: `Liquidatable! Debt: ${fmtPas(debt)} PAS` });
        } else {
          setLiqStatus({ ok: false, detail: 'Position is healthy.' });
        }
      }
    } catch {
      setLiqStatus({ ok: false, detail: 'Lookup failed.' });
    } finally {
      if (fetchId === liqFetchId.current) setLiqLookingUp(false);
    }
  }

  if (!LENDING_POOL) return (
    <div className="p-20 text-center text-xs uppercase font-black text-gray-600 tracking-widest italic">
      Lending Pool Not Deployed
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-black tracking-tight text-white">
          VeraScore <span className="text-polkadot-pink">Lending</span>
        </h1>
        <p className="text-[10px] text-gray-600 mt-0.5 font-medium">
          Credit-gated liquidity · Paseo Hub native
        </p>
      </div>

      {/* Wrong network */}
      {isWrongNetwork && (
        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-yellow-400 font-semibold">⚠ Switch to Paseo Hub</span>
          <button onClick={() => switchChain({ chainId: pasTestnet.id })}
            className="text-xs bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-1.5 rounded-lg font-bold transition-colors">
            Switch
          </button>
        </div>
      )}

      {/* Tier cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {TIERS.map(t => (
          <div key={t.label} className={`${t.bg} border ${t.border} rounded-2xl px-3 py-3 space-y-1`}>
            <div className={`text-[8px] font-black uppercase tracking-widest ${t.color}`}>{t.label}</div>
            <div className="text-lg font-black text-white tracking-tight">
              {t.ltv} <span className="text-[8px] text-gray-700 uppercase">LTV</span>
            </div>
            <div className="flex justify-between text-[8px] font-bold text-gray-700 uppercase pt-1.5 border-t border-white/5">
              <span>APR: {t.apr}</span><span className="font-mono">{t.range}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Pool stats */}
      {poolStats?.success && (
        <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-polkadot-border bg-black/20">
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Pool Stats</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-polkadot-border">
            {[
              ['Liquidity',   `${parseFloat(poolStats.liquidity).toFixed(4)} PAS`],
              ['Collateral',  `${parseFloat(poolStats.totalCollateral).toFixed(4)} PAS`],
              ['Borrowed',    `${parseFloat(poolStats.totalBorrowed).toFixed(4)} PAS`],
              ['Utilisation', `${poolStats.utilisationPct}%`],
            ].map(([l, v]) => (
              <div key={l} className="bg-polkadot-card px-4 py-3">
                <div className="text-[8px] font-bold uppercase tracking-widest text-gray-700">{l}</div>
                <div className="text-sm font-black font-mono text-white mt-0.5">{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Position card */}
      <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden shadow-xl">
        <div className="px-4 py-3 border-b border-polkadot-border bg-black/20 flex justify-between items-center">
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Your Position</span>
          {simResult?.score && (
            <span className="text-[9px] font-black text-polkadot-pink uppercase tracking-widest">
              Score: {simResult.score}
            </span>
          )}
        </div>
        <div className="px-4 py-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ['Collateral', pos ? `${fmtPas(pos.collateral)} PAS` : '—'],
              ['Total Debt',  pos ? `${fmtPas(effectiveDebt)} PAS` : '—'],
              ['LTV Ratio',  pos ? `${pos.ltvBps / 100}%`   : '—'],
              ['Fixed APR',  pos ? `${pos.aprBps / 100}%`   : '—'],
            ].map(([l, v]) => (
              <div key={l} className="bg-polkadot-dark border border-white/5 rounded-xl px-3 py-2.5">
                <div className="text-[8px] font-bold uppercase tracking-widest text-gray-700 mb-1">{l}</div>
                <div className="text-xs font-black font-mono text-white">{v}</div>
              </div>
            ))}
          </div>

          {pos?.active && <HealthBar hf={pos.healthFactor} liqThreshBps={pos.liqThreshBps} />}

          {walletBalance && (
            <div className="text-[9px] text-gray-700 font-mono">
              Wallet: <span className="text-gray-500">{parseFloat(formatEther(walletBalance.value)).toFixed(4)} PAS</span>
            </div>
          )}

          <div className={`rounded-xl px-3 py-2.5 text-[9px] font-bold uppercase tracking-widest text-center border ${
            simLoading
              ? 'bg-white/5 border-white/10 text-gray-500'
              : simResult?.eligible
              ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
              : simResult?.tier === 'expired'
              ? 'bg-yellow-500/5 border-yellow-500/20 text-yellow-400'
              : 'bg-red-500/5 border-red-500/20 text-red-400'
          }`}>
            {!isConnected           ? '⚠ Connect wallet'
              : simLoading          ? '⟳ Checking score…'
              : simResult?.eligible ? '✦ Eligible for Credit'
              : simResult?.tier === 'expired'  ? '⚠ Score Expired — Refresh to Borrow'
              : simResult?.tier === 'no_score' ? '✗ No VeraScore — Mint First'
              : simResult           ? '✗ Score Below Minimum (250)'
              : '⚠ Could not fetch score'}
          </div>
          {isConnected && (simResult?.tier === 'expired' || simResult?.tier === 'no_score') && (
            <a href="/" className="block text-center text-[9px] text-polkadot-pink hover:opacity-70 uppercase tracking-widest">
              → Go to Score page
            </a>
          )}
        </div>
      </div>

      {/* Action cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* Deposit */}
        <ActionCard title="1. Supply Collateral">
          <PasInput value={depositInput} onChange={setDepositInput} />
          <button
            onClick={() => depositAction.execute({
              address: LENDING_POOL, abi: POOL_ABI, functionName: 'deposit',
              value: parseEther(depositInput || '0'), gas: GAS.deposit,
            })}
            disabled={!isConnected || depositAction.status === 'signing' || depositAction.status === 'mining'}
            className="w-full py-3 bg-polkadot-pink hover:bg-pink-600 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_10px_rgba(230,0,122,0.15)]">
            {depositAction.status === 'mining' ? 'Mining…' : depositAction.status === 'signing' ? 'Confirm…' : 'Deposit'}
          </button>
          <ActionFeedback status={depositAction.status} txError={depositAction.txError} />
        </ActionCard>

        {/* Borrow */}
        <ActionCard title="2. Draw Liquidity">
          <PasInput value={borrowInput} onChange={setBorrowInput} />
          <button
            onClick={() => borrowAction.execute({
              address: LENDING_POOL, abi: POOL_ABI, functionName: 'borrow',
              args: [parseEther(borrowInput || '0')], gas: GAS.borrow,
            })}
            disabled={!isConnected || !simResult?.eligible || borrowAction.status === 'signing' || borrowAction.status === 'mining'}
            className="w-full py-3 bg-white/5 border border-white/10 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            {borrowAction.status === 'mining' ? 'Mining…' : borrowAction.status === 'signing' ? 'Confirm…' : 'Borrow'}
          </button>
          <ActionFeedback status={borrowAction.status} txError={borrowAction.txError} />
        </ActionCard>

        {/* Repay */}
        <ActionCard title="3. Repay Debt">
          {effectiveDebt > 0n && (
            <button onClick={() => setRepayInput(formatEther(effectiveDebt + effectiveDebt / 200n))}
              className="text-[9px] font-bold text-polkadot-pink hover:opacity-70 uppercase tracking-widest">
              Max: {fmtPas(effectiveDebt)} PAS
            </button>
          )}
          <PasInput value={repayInput} onChange={setRepayInput}
            placeholder={effectiveDebt > 0n ? fmtPas(effectiveDebt) : '0.00'} />
          <button
            onClick={() => repayAction.execute({
              address: LENDING_POOL, abi: POOL_ABI, functionName: 'repay',
              value: parseEther(repayInput || '0'), gas: GAS.repay,
            })}
            disabled={!isConnected || effectiveDebt === 0n || !repayInput || repayAction.status === 'signing' || repayAction.status === 'mining'}
            className="w-full py-3 bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            {repayAction.status === 'mining' ? 'Mining…' : repayAction.status === 'signing' ? 'Confirm…' : 'Repay'}
          </button>
          <ActionFeedback status={repayAction.status} txError={repayAction.txError} />
        </ActionCard>

        {/* Withdraw */}
        <ActionCard title="4. Withdraw Collateral">
          {withdrawableAmount > 0n && (
            <button onClick={() => setWithdrawInput(formatEther(withdrawableAmount))}
              className="text-[9px] font-bold text-polkadot-pink hover:opacity-70 uppercase tracking-widest">
              Max: {fmtPas(withdrawableAmount)} PAS
            </button>
          )}
          <PasInput value={withdrawInput} onChange={setWithdrawInput}
            placeholder={withdrawableAmount > 0n ? fmtPas(withdrawableAmount) : '0.00'} />
          <button
            onClick={() => withdrawAction.execute({
              address: LENDING_POOL, abi: POOL_ABI, functionName: 'withdraw',
              args: [parseEther(withdrawInput || '0')], gas: GAS.withdraw,
            })}
            disabled={!isConnected || withdrawableAmount === 0n || !withdrawInput || withdrawAction.status === 'signing' || withdrawAction.status === 'mining'}
            className="w-full py-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            {withdrawAction.status === 'mining' ? 'Mining…' : withdrawAction.status === 'signing' ? 'Confirm…' : 'Withdraw'}
          </button>
          <ActionFeedback status={withdrawAction.status} txError={withdrawAction.txError} />
        </ActionCard>
      </div>

      {/* Liquidation */}
      <ActionCard title="Liquidation Engine" accent="border-red-500/20">
        <div className="flex items-center justify-between -mt-1">
          <span className="text-[8px] text-gray-700">Repay unhealthy positions · earn 5% bounty</span>
          <span className="bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full text-[8px] font-black uppercase border border-red-500/20">5% Bounty</span>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input type="text" placeholder="Borrower address (0x…)" value={liqTarget}
              onChange={e => lookupLiqTarget(e.target.value)}
              className="w-full bg-polkadot-dark border border-polkadot-border rounded-xl px-4 py-2.5 text-xs font-mono text-white outline-none focus:border-red-500/40 placeholder-gray-700" />
            {liqLookingUp && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          <button
            onClick={() => liqAction.execute({
              address: LENDING_POOL, abi: POOL_ABI, functionName: 'liquidate',
              args: [liqTarget as `0x${string}`],
              value: liqTargetDebt + parseEther('0.001'),
              gas:   GAS.liquidate,
            })}
            disabled={!liqStatus?.ok || liqAction.status === 'signing' || liqAction.status === 'mining'}
            className="bg-red-600 hover:bg-red-500 disabled:bg-gray-800 disabled:text-gray-600 text-white px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:cursor-not-allowed">
            {liqAction.status === 'mining' ? '…' : 'Liquidate'}
          </button>
        </div>
        {liqStatus && (
          <p className={`text-[9px] font-bold uppercase tracking-widest ${liqStatus.ok ? 'text-emerald-400 animate-pulse' : 'text-gray-600'}`}>
            {liqStatus.detail}
          </p>
        )}
        <ActionFeedback status={liqAction.status} txError={liqAction.txError} />
      </ActionCard>

    </div>
  );
}