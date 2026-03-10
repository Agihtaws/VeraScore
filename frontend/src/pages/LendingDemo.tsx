'use client';

import { useState, useEffect, useCallback, useRef }  from 'react';
import {
  useAccount, useReadContract, useWriteContract,
  useWaitForTransactionReceipt, useBalance, useSwitchChain, useChainId,
} from 'wagmi';
import { parseEther, formatEther }            from 'viem';
import { pasTestnet }                         from '../utils/wagmi';

// ── Contract & RPC Config ───────────────────────────────────────────────────

const LENDING_POOL = (import.meta.env.VITE_LENDING_POOL ?? '') as `0x${string}`;
const RPC_URL = 'https://pas-rpc.stakeworld.io/assethub';
const EXPLORER = 'https://polkadot.testnet.routescan.io';

const POOL_ABI = [
  { name: 'deposit', type: 'function', stateMutability: 'payable', inputs: [], outputs: [] },
  { name: 'borrow', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'repay', type: 'function', stateMutability: 'payable', inputs: [], outputs: [] },
  { name: 'withdraw', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'liquidate', type: 'function', stateMutability: 'payable', inputs: [{ name: 'borrower', type: 'address' }], outputs: [] },
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
  { name: 'poolLiquidity', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'totalCollateral', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'totalBorrowed', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'withdrawableCollateral', type: 'function', stateMutability: 'view', inputs: [{ name: 'borrower', type: 'address' }], outputs: [{ type: 'uint256' }] },
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
  totalCollateral: string;
  totalBorrowed:   string;
  utilisationPct:  string;
}

interface SimResult {
  success:             boolean;
  hasScore:            boolean;
  score:               number | null;
  isValid:             boolean;
  scoreExpires:        number | null;
  tier?:               string;
  label?:              string;
  ltvPct?:             number;
  eligible?:           boolean;
}

// ── Constants & Helpers ───────────────────────────────────────────────────────

const MAX_HF = BigInt('0x' + 'f'.repeat(64));
const DUST   = 100n; // Fixed the missing DUST variable pa!

const TIERS = [
  { label: 'Excellent', range: '800–1100', ltv: '90%', liq: '95%', apr: '5%',  color: 'text-emerald-400', border: 'border-emerald-500/20' },
  { label: 'Good',      range: '500–799',  ltv: '75%', liq: '80%', apr: '8%',  color: 'text-amber-400',    border: 'border-amber-500/20' },
  { label: 'Fair',      range: '250–499',  ltv: '60%', liq: '65%', apr: '12%', color: 'text-orange-400',   border: 'border-orange-500/20' },
  { label: 'Denied',    range: '0–249',    ltv: '—',   liq: '—',   apr: '—',   color: 'text-red-400',      border: 'border-red-500/20'    },
];

function fmtPas(wei: bigint): string {
  const v = parseFloat(formatEther(wei));
  return v === 0 ? '0' : v < 0.001 ? '<0.001' : v.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function hfColor(hf: bigint): string {
  if (hf === MAX_HF) return 'text-gray-600';
  const v = parseFloat(formatEther(hf));
  if (v >= 2)   return 'text-emerald-400';
  if (v >= 1.2) return 'text-amber-400';
  return 'text-red-400';
}

function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
    </svg>
  );
}

// ── Action hook ───────────────────────────────────────────────────────────────

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
  });

  useEffect(() => {
    if (!pendingHash) return;
    if (isSuccess) {
      setStatus('done');
      setPendingHash(undefined);
      setTimeout(onSuccess, 500);
    }
    if (isError) {
      setStatus('error');
      setTxError(receiptError?.message ?? 'Transaction failed');
      setPendingHash(undefined);
    }
  }, [isSuccess, isError, pendingHash, onSuccess, receiptError]);

  const execute = useCallback(async (args: any) => {
    setStatus('signing');
    setTxError(null);
    try {
      if (chainId !== pasTestnet.id) {
        await switchChainAsync({ chainId: pasTestnet.id });
      }
      const hash = await writeContractAsync(args);
      setPendingHash(hash);
      setStatus('mining');
    } catch (err: any) {
      setStatus('error');
      setTxError(err.message.includes('User rejected') ? 'Rejected in wallet' : err.message.slice(0, 100));
    }
  }, [writeContractAsync, switchChainAsync, chainId]);

  const reset = useCallback(() => {
    setStatus('idle');
    setTxError(null);
    setPendingHash(undefined);
  }, []);

  return { status, txError, execute, reset };
}

function ActionFeedback({ status, txError }: { status: ActionStatus; txError: string | null }) {
  if (status === 'idle') return null;
  if (status === 'signing') return <div className="text-[10px] text-amber-400 animate-pulse uppercase font-black tracking-widest">Check MetaMask...</div>;
  if (status === 'mining') return <div className="text-[10px] text-blue-400 animate-pulse uppercase font-black tracking-widest">Mining on Hub...</div>;
  if (status === 'done') return <div className="text-[10px] text-emerald-400 uppercase font-black tracking-widest">✓ Confirmed</div>;
  if (status === 'error') return <div className="text-[10px] text-red-500 uppercase font-black tracking-widest">Error: {txError}</div>;
  return null;
}

function HealthBar({ hf, liqThreshBps }: { hf: bigint; liqThreshBps: number }) {
  if (hf === MAX_HF) return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px] font-black uppercase text-gray-600 tracking-widest">
        <span>Health Factor</span><span>∞</span>
      </div>
      <div className="h-1.5 bg-black/40 rounded-full border border-white/5 shadow-inner" />
    </div>
  );

  const hfVal = parseFloat(formatEther(hf));
  const pct   = Math.min(100, (hfVal / 3) * 100);
  const color = hfVal >= 2 ? 'bg-emerald-500' : hfVal >= 1.2 ? 'bg-amber-500' : 'bg-red-500';

  function fmtHF(hf: bigint): import("react").ReactNode {
    throw new Error('Function not implemented.');
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
        <span className="text-gray-600">Health Factor</span>
        <span className={`${hfColor(hf)} font-mono font-bold`}>{fmtHF(hf)}</span>
      </div>
      <div className="h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5 shadow-inner text-right">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function LendingDemo() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const isWrongNetwork = isConnected && chainId !== pasTestnet.id;

  const [depositInput,  setDepositInput]  = useState('0.1');
  const [borrowInput,   setBorrowInput]   = useState('0.05');
  const [repayInput,    setRepayInput]    = useState('');
  const [withdrawInput, setWithdrawInput] = useState('');
  const [liqTarget,      setLiqTarget]      = useState('');
  const [liqTargetDebt,  setLiqTargetDebt]  = useState<bigint>(0n);
  const [liqLookingUp,   setLiqLookingUp]   = useState(false);
  const [liqStatus,      setLiqStatus]      = useState<{ ok: boolean; debt?: bigint; detail: string } | null>(null);
  const liqFetchId = useRef(0);

  const [poolStats, setPoolStats] = useState<PoolStats | null>(null);
  const [simResult, setSimResult] = useState<SimResult | null>(null);

  // ── Contract Reads ──
  const { data: posRaw, refetch: refetchPos } = useReadContract({
    address: LENDING_POOL,
    abi: POOL_ABI,
    functionName: 'getPosition',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: !!address, refetchInterval: 12_000 },
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
    query: { enabled: !!address, refetchInterval: 12_000 },
  });

  const { data: walletBalance } = useBalance({ address, chainId: pasTestnet.id, query: { refetchInterval: 10_000 } });

  const pos: PositionData | null = posRaw ? {
    collateral: (posRaw as any)[0], principal: (posRaw as any)[1],
    interestAccrued: (posRaw as any)[2], totalDebt: (posRaw as any)[3],
    healthFactor: (posRaw as any)[4], ltvBps: Number((posRaw as any)[5]),
    liqThreshBps: Number((posRaw as any)[6]), aprBps: Number((posRaw as any)[7]),
    active: (posRaw as any)[8]
  } : null;

  const effectiveDebt = pos ? (pos.totalDebt <= DUST ? 0n : pos.totalDebt) : 0n;

  const refetchAll = useCallback(() => {
    refetchPos(); refetchLiq(); refetchWithdrawable();
    fetch('/lending/pool').then(r => r.json()).then(setPoolStats);
  }, [refetchPos, refetchLiq, refetchWithdrawable]);

  const depositAction  = usePoolAction(refetchAll);
  const borrowAction   = usePoolAction(refetchAll);
  const repayAction    = usePoolAction(refetchAll);
  const withdrawAction = usePoolAction(refetchAll);
  const liqAction      = usePoolAction(refetchAll);

  useEffect(() => {
    fetch('/lending/pool').then(r => r.json()).then(setPoolStats);
    if (address) fetch(`/lending/simulate/${address}?amount=1000`).then(r => r.json()).then(setSimResult);
  }, [address]);

  const GAS = { deposit: 120000n, borrow: 180000n, repay: 180000n, withdraw: 150000n, liquidate: 250000n };

  async function lookupLiqTarget(addr: string) {
    setLiqTarget(addr);
    if (addr.length !== 42) return;
    const fetchId = ++liqFetchId.current;
    setLiqLookingUp(true);
    try {
      const r = await fetch(`/lending/position/${addr}`);
      const data = await r.json();
      if (fetchId !== liqFetchId.current) return;
      if (!data.success || !data.active) {
        setLiqStatus({ ok: false, detail: 'No active position found.' });
      } else {
        const debt = BigInt(data.totalDebtWei ?? '0');
        if (debt === 0n) setLiqStatus({ ok: false, detail: 'Zero debt.' });
        else if (!data.scoreValid || debt > (BigInt(data.collateralWei) * BigInt(data.liqThreshBps) / 10000n)) {
          setLiqTargetDebt(debt);
          setLiqStatus({ ok: true, debt, detail: 'Liquidatable!' });
        } else setLiqStatus({ ok: false, detail: 'Position healthy.' });
      }
    } finally { if (fetchId === liqFetchId.current) setLiqLookingUp(false); }
  }

  if (!LENDING_POOL) return <div className="p-20 text-center uppercase font-black text-gray-600 tracking-widest italic">Lending Pool Not Deployed</div>;

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-12">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400 shadow-lg shadow-emerald-500/5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Protocol Lending Active
        </div>
        <h1 className="text-6xl font-black tracking-tighter uppercase italic text-white drop-shadow-[0_0_20px_rgba(230,0,122,0.2)]">VeraScore <span className="text-polkadot-pink">Lending</span></h1>
        <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.4em] max-w-2xl mx-auto leading-relaxed">Credit-Gated Liquidity · Paseo Parachain Native</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {TIERS.map(t => (
          <div key={t.label} className={`bg-polkadot-card border ${t.border} rounded-[32px] p-6 space-y-2 shadow-2xl shadow-black/50 hover:scale-[1.02] transition-all`}>
            <div className={`text-[10px] font-black uppercase tracking-widest ${t.color}`}>{t.label}</div>
            <div className="text-3xl font-black text-white tracking-tighter">{t.ltv} <span className="text-[10px] text-gray-700 tracking-tighter uppercase">LTV</span></div>
            <div className="flex justify-between text-[8px] font-black text-gray-600 uppercase pt-3 border-t border-white/5">
              <span>APR: {t.apr}</span><span>Range: {t.range}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-polkadot-card border border-polkadot-border rounded-[48px] overflow-hidden shadow-2xl">
            <div className="px-8 py-6 border-b border-polkadot-border bg-black/20 flex justify-between items-center">
              <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Active Position</span>
              {simResult?.score && <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">VeraScore: {simResult.score}</span>}
            </div>
            <div className="p-8 space-y-8">
              <div className="grid grid-cols-2 gap-4">
                {[ ['Collateral', pos ? fmtPas(pos.collateral) : '0.00'], ['Total Debt', pos ? fmtPas(pos.totalDebt) : '0.00'], ['LTV Ratio', pos ? `${pos.ltvBps / 100}%` : '0%'], ['Fixed APR', pos ? `${pos.aprBps / 100}%` : '0%'] ].map(([l, v]) => (
                  <div key={l} className="bg-polkadot-dark/40 border border-white/5 rounded-3xl p-5 shadow-inner">
                    <div className="text-[9px] text-gray-600 font-black uppercase tracking-tighter mb-1">{l}</div>
                    <div className="text-lg font-black font-mono text-white tracking-tighter">{v}</div>
                  </div>
                ))}
              </div>
              {pos?.active && <HealthBar hf={pos.healthFactor} liqThreshBps={pos.liqThreshBps} />}
              <div className={`rounded-2xl px-5 py-4 text-[10px] font-black uppercase tracking-widest text-center border shadow-lg ${simResult?.eligible ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-red-500/5 border-red-500/20 text-red-400'}`}>
                {simResult?.eligible ? '✦ Account Eligible for Credit' : '⚠️ Insufficient Credit Score'}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-polkadot-card border border-polkadot-border rounded-[40px] p-8 space-y-6 shadow-xl">
              <h3 className="text-[10px] text-gray-500 font-black uppercase tracking-widest">1. Supply Collateral</h3>
              <div className="relative">
                <input type="number" value={depositInput} onChange={e => setDepositInput(e.target.value)} className="w-full bg-polkadot-dark border border-polkadot-border rounded-2xl px-5 py-4 text-xl font-mono text-white outline-none focus:border-polkadot-pink/40 shadow-inner" />
                <span className="absolute right-5 top-1/2 -translate-y-1/2 font-black text-[10px] text-gray-600 uppercase">PAS</span>
              </div>
              <button onClick={() => depositAction.execute({ address: LENDING_POOL, abi: POOL_ABI, functionName: 'deposit', value: parseEther(depositInput), gas: GAS.deposit })} className="w-full py-5 bg-polkadot-pink text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-[1.02] transition-all shadow-xl shadow-polkadot-pink/20">Confirm Deposit</button>
              <ActionFeedback status={depositAction.status} txError={depositAction.txError} />
            </div>

            <div className="bg-polkadot-card border border-polkadot-border rounded-[40px] p-8 space-y-6 shadow-xl">
              <h3 className="text-[10px] text-gray-500 font-black uppercase tracking-widest">2. Draw Liquidity</h3>
              <div className="relative">
                <input type="number" value={borrowInput} onChange={e => setBorrowInput(e.target.value)} className="w-full bg-polkadot-dark border border-polkadot-border rounded-2xl px-5 py-4 text-xl font-mono text-white outline-none focus:border-polkadot-pink/40 shadow-inner" />
                <span className="absolute right-5 top-1/2 -translate-y-1/2 font-black text-[10px] text-gray-600 uppercase">PAS</span>
              </div>
              <button onClick={() => borrowAction.execute({ address: LENDING_POOL, abi: POOL_ABI, functionName: 'borrow', args: [parseEther(borrowInput)], gas: GAS.borrow })} className="w-full py-5 bg-white/5 border border-white/10 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-white/10 transition-all shadow-xl">Borrow Funds</button>
              <ActionFeedback status={borrowAction.status} txError={borrowAction.txError} />
            </div>
          </div>

          <div className="bg-polkadot-card border border-red-500/20 rounded-[40px] p-10 space-y-8 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-[10px] text-red-500 font-black uppercase tracking-[0.3em]">Liquidation Engine</h3>
              <span className="bg-red-500/10 text-red-500 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter border border-red-500/20">5% Bounty Active</span>
            </div>
            <div className="flex gap-4">
              <input type="text" placeholder="BORROWER IDENTITY (0x...)" value={liqTarget} onChange={e => lookupLiqTarget(e.target.value)} className="flex-1 bg-polkadot-dark border border-polkadot-border rounded-2xl px-6 py-5 text-sm font-mono text-white outline-none focus:border-red-500/40 shadow-inner" />
              <button onClick={() => liqAction.execute({ address: LENDING_POOL, abi: POOL_ABI, functionName: 'liquidate', args: [liqTarget], value: liqTargetDebt + parseEther('0.001'), gas: GAS.liquidate })} disabled={!liqStatus?.ok} className="bg-red-600 disabled:bg-gray-800 text-white px-10 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl active:scale-95">Liquidate</button>
            </div>
            {liqStatus && <div className={`text-[10px] font-black uppercase tracking-widest text-center ${liqStatus.ok ? 'text-emerald-400 animate-pulse' : 'text-gray-700'}`}>{liqStatus.detail}</div>}
            <ActionFeedback status={liqAction.status} txError={liqAction.txError} />
          </div>
        </div>
      </div>
    </div>
  );
}
