'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useBalance, useSwitchChain, useChainId, } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { pasTestnet } from '../utils/wagmi';
// ── Contract & RPC Config ───────────────────────────────────────────────────
const LENDING_POOL = (import.meta.env.VITE_LENDING_POOL ?? '');
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
            { name: 'collateral', type: 'uint256' },
            { name: 'principal', type: 'uint256' },
            { name: 'interestAccrued', type: 'uint256' },
            { name: 'totalDebt', type: 'uint256' },
            { name: 'healthFactor', type: 'uint256' },
            { name: 'ltvBps', type: 'uint16' },
            { name: 'liqThreshBps', type: 'uint16' },
            { name: 'aprBps', type: 'uint16' },
            { name: 'active', type: 'bool' },
        ],
    },
    { name: 'poolLiquidity', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    { name: 'totalCollateral', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    { name: 'totalBorrowed', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    { name: 'withdrawableCollateral', type: 'function', stateMutability: 'view', inputs: [{ name: 'borrower', type: 'address' }], outputs: [{ type: 'uint256' }] },
];
// ── Constants & Helpers ───────────────────────────────────────────────────────
const MAX_HF = BigInt('0x' + 'f'.repeat(64));
const DUST = 100n; // Fixed the missing DUST variable pa!
const TIERS = [
    { label: 'Excellent', range: '800–1100', ltv: '90%', liq: '95%', apr: '5%', color: 'text-emerald-400', border: 'border-emerald-500/20' },
    { label: 'Good', range: '500–799', ltv: '75%', liq: '80%', apr: '8%', color: 'text-amber-400', border: 'border-amber-500/20' },
    { label: 'Fair', range: '250–499', ltv: '60%', liq: '65%', apr: '12%', color: 'text-orange-400', border: 'border-orange-500/20' },
    { label: 'Denied', range: '0–249', ltv: '—', liq: '—', apr: '—', color: 'text-red-400', border: 'border-red-500/20' },
];
function fmtPas(wei) {
    const v = parseFloat(formatEther(wei));
    return v === 0 ? '0' : v < 0.001 ? '<0.001' : v.toLocaleString(undefined, { maximumFractionDigits: 4 });
}
function hfColor(hf) {
    if (hf === MAX_HF)
        return 'text-gray-600';
    const v = parseFloat(formatEther(hf));
    if (v >= 2)
        return 'text-emerald-400';
    if (v >= 1.2)
        return 'text-amber-400';
    return 'text-red-400';
}
function Spinner({ className = 'h-4 w-4' }) {
    return (_jsxs("svg", { className: `animate-spin ${className}`, viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8v8H4z" })] }));
}
function usePoolAction(onSuccess) {
    const [status, setStatus] = useState('idle');
    const [txError, setTxError] = useState(null);
    const [pendingHash, setPendingHash] = useState(undefined);
    const { writeContractAsync } = useWriteContract();
    const { switchChainAsync } = useSwitchChain();
    const chainId = useChainId();
    const { isSuccess, isError, error: receiptError } = useWaitForTransactionReceipt({
        hash: pendingHash,
        confirmations: 1,
    });
    useEffect(() => {
        if (!pendingHash)
            return;
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
    const execute = useCallback(async (args) => {
        setStatus('signing');
        setTxError(null);
        try {
            if (chainId !== pasTestnet.id) {
                await switchChainAsync({ chainId: pasTestnet.id });
            }
            const hash = await writeContractAsync(args);
            setPendingHash(hash);
            setStatus('mining');
        }
        catch (err) {
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
function ActionFeedback({ status, txError }) {
    if (status === 'idle')
        return null;
    if (status === 'signing')
        return _jsx("div", { className: "text-[10px] text-amber-400 animate-pulse uppercase font-black tracking-widest", children: "Check MetaMask..." });
    if (status === 'mining')
        return _jsx("div", { className: "text-[10px] text-blue-400 animate-pulse uppercase font-black tracking-widest", children: "Mining on Hub..." });
    if (status === 'done')
        return _jsx("div", { className: "text-[10px] text-emerald-400 uppercase font-black tracking-widest", children: "\u2713 Confirmed" });
    if (status === 'error')
        return _jsxs("div", { className: "text-[10px] text-red-500 uppercase font-black tracking-widest", children: ["Error: ", txError] });
    return null;
}
function HealthBar({ hf, liqThreshBps }) {
    if (hf === MAX_HF)
        return (_jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "flex justify-between text-[10px] font-black uppercase text-gray-600 tracking-widest", children: [_jsx("span", { children: "Health Factor" }), _jsx("span", { children: "\u221E" })] }), _jsx("div", { className: "h-1.5 bg-black/40 rounded-full border border-white/5 shadow-inner" })] }));
    const hfVal = parseFloat(formatEther(hf));
    const pct = Math.min(100, (hfVal / 3) * 100);
    const color = hfVal >= 2 ? 'bg-emerald-500' : hfVal >= 1.2 ? 'bg-amber-500' : 'bg-red-500';
    function fmtHF(hf) {
        throw new Error('Function not implemented.');
    }
    return (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex justify-between text-[10px] font-black uppercase tracking-widest", children: [_jsx("span", { className: "text-gray-600", children: "Health Factor" }), _jsx("span", { className: `${hfColor(hf)} font-mono font-bold`, children: fmtHF(hf) })] }), _jsx("div", { className: "h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5 shadow-inner text-right", children: _jsx("div", { className: `h-full rounded-full transition-all duration-700 ${color}`, style: { width: `${pct}%` } }) })] }));
}
// ── Main component ────────────────────────────────────────────────────────────
export function LendingDemo() {
    const { address, isConnected } = useAccount();
    const chainId = useChainId();
    const { switchChain } = useSwitchChain();
    const isWrongNetwork = isConnected && chainId !== pasTestnet.id;
    const [depositInput, setDepositInput] = useState('0.1');
    const [borrowInput, setBorrowInput] = useState('0.05');
    const [repayInput, setRepayInput] = useState('');
    const [withdrawInput, setWithdrawInput] = useState('');
    const [liqTarget, setLiqTarget] = useState('');
    const [liqTargetDebt, setLiqTargetDebt] = useState(0n);
    const [liqLookingUp, setLiqLookingUp] = useState(false);
    const [liqStatus, setLiqStatus] = useState(null);
    const liqFetchId = useRef(0);
    const [poolStats, setPoolStats] = useState(null);
    const [simResult, setSimResult] = useState(null);
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
    const pos = posRaw ? {
        collateral: posRaw[0], principal: posRaw[1],
        interestAccrued: posRaw[2], totalDebt: posRaw[3],
        healthFactor: posRaw[4], ltvBps: Number(posRaw[5]),
        liqThreshBps: Number(posRaw[6]), aprBps: Number(posRaw[7]),
        active: posRaw[8]
    } : null;
    const effectiveDebt = pos ? (pos.totalDebt <= DUST ? 0n : pos.totalDebt) : 0n;
    const refetchAll = useCallback(() => {
        refetchPos();
        refetchLiq();
        refetchWithdrawable();
        fetch('/lending/pool').then(r => r.json()).then(setPoolStats);
    }, [refetchPos, refetchLiq, refetchWithdrawable]);
    const depositAction = usePoolAction(refetchAll);
    const borrowAction = usePoolAction(refetchAll);
    const repayAction = usePoolAction(refetchAll);
    const withdrawAction = usePoolAction(refetchAll);
    const liqAction = usePoolAction(refetchAll);
    useEffect(() => {
        fetch('/lending/pool').then(r => r.json()).then(setPoolStats);
        if (address)
            fetch(`/lending/simulate/${address}?amount=1000`).then(r => r.json()).then(setSimResult);
    }, [address]);
    const GAS = { deposit: 120000n, borrow: 180000n, repay: 180000n, withdraw: 150000n, liquidate: 250000n };
    async function lookupLiqTarget(addr) {
        setLiqTarget(addr);
        if (addr.length !== 42)
            return;
        const fetchId = ++liqFetchId.current;
        setLiqLookingUp(true);
        try {
            const r = await fetch(`/lending/position/${addr}`);
            const data = await r.json();
            if (fetchId !== liqFetchId.current)
                return;
            if (!data.success || !data.active) {
                setLiqStatus({ ok: false, detail: 'No active position found.' });
            }
            else {
                const debt = BigInt(data.totalDebtWei ?? '0');
                if (debt === 0n)
                    setLiqStatus({ ok: false, detail: 'Zero debt.' });
                else if (!data.scoreValid || debt > (BigInt(data.collateralWei) * BigInt(data.liqThreshBps) / 10000n)) {
                    setLiqTargetDebt(debt);
                    setLiqStatus({ ok: true, debt, detail: 'Liquidatable!' });
                }
                else
                    setLiqStatus({ ok: false, detail: 'Position healthy.' });
            }
        }
        finally {
            if (fetchId === liqFetchId.current)
                setLiqLookingUp(false);
        }
    }
    if (!LENDING_POOL)
        return _jsx("div", { className: "p-20 text-center uppercase font-black text-gray-600 tracking-widest italic", children: "Lending Pool Not Deployed" });
    return (_jsxs("div", { className: "max-w-7xl mx-auto px-6 py-12 space-y-12", children: [_jsxs("div", { className: "text-center space-y-4", children: [_jsxs("div", { className: "inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400 shadow-lg shadow-emerald-500/5", children: [_jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" }), "Protocol Lending Active"] }), _jsxs("h1", { className: "text-6xl font-black tracking-tighter uppercase italic text-white drop-shadow-[0_0_20px_rgba(230,0,122,0.2)]", children: ["VeraScore ", _jsx("span", { className: "text-polkadot-pink", children: "Lending" })] }), _jsx("p", { className: "text-gray-500 text-[10px] font-black uppercase tracking-[0.4em] max-w-2xl mx-auto leading-relaxed", children: "Credit-Gated Liquidity \u00B7 Paseo Parachain Native" })] }), _jsx("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-4", children: TIERS.map(t => (_jsxs("div", { className: `bg-polkadot-card border ${t.border} rounded-[32px] p-6 space-y-2 shadow-2xl shadow-black/50 hover:scale-[1.02] transition-all`, children: [_jsx("div", { className: `text-[10px] font-black uppercase tracking-widest ${t.color}`, children: t.label }), _jsxs("div", { className: "text-3xl font-black text-white tracking-tighter", children: [t.ltv, " ", _jsx("span", { className: "text-[10px] text-gray-700 tracking-tighter uppercase", children: "LTV" })] }), _jsxs("div", { className: "flex justify-between text-[8px] font-black text-gray-600 uppercase pt-3 border-t border-white/5", children: [_jsxs("span", { children: ["APR: ", t.apr] }), _jsxs("span", { children: ["Range: ", t.range] })] })] }, t.label))) }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-12 gap-8", children: [_jsx("div", { className: "lg:col-span-5 space-y-6", children: _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-[48px] overflow-hidden shadow-2xl", children: [_jsxs("div", { className: "px-8 py-6 border-b border-polkadot-border bg-black/20 flex justify-between items-center", children: [_jsx("span", { className: "text-[10px] text-gray-500 font-black uppercase tracking-widest", children: "Active Position" }), simResult?.score && _jsxs("span", { className: "text-[10px] font-black text-emerald-400 uppercase tracking-widest", children: ["VeraScore: ", simResult.score] })] }), _jsxs("div", { className: "p-8 space-y-8", children: [_jsx("div", { className: "grid grid-cols-2 gap-4", children: [['Collateral', pos ? fmtPas(pos.collateral) : '0.00'], ['Total Debt', pos ? fmtPas(pos.totalDebt) : '0.00'], ['LTV Ratio', pos ? `${pos.ltvBps / 100}%` : '0%'], ['Fixed APR', pos ? `${pos.aprBps / 100}%` : '0%']].map(([l, v]) => (_jsxs("div", { className: "bg-polkadot-dark/40 border border-white/5 rounded-3xl p-5 shadow-inner", children: [_jsx("div", { className: "text-[9px] text-gray-600 font-black uppercase tracking-tighter mb-1", children: l }), _jsx("div", { className: "text-lg font-black font-mono text-white tracking-tighter", children: v })] }, l))) }), pos?.active && _jsx(HealthBar, { hf: pos.healthFactor, liqThreshBps: pos.liqThreshBps }), _jsx("div", { className: `rounded-2xl px-5 py-4 text-[10px] font-black uppercase tracking-widest text-center border shadow-lg ${simResult?.eligible ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-red-500/5 border-red-500/20 text-red-400'}`, children: simResult?.eligible ? '✦ Account Eligible for Credit' : '⚠️ Insufficient Credit Score' })] })] }) }), _jsxs("div", { className: "lg:col-span-7 space-y-6", children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-[40px] p-8 space-y-6 shadow-xl", children: [_jsx("h3", { className: "text-[10px] text-gray-500 font-black uppercase tracking-widest", children: "1. Supply Collateral" }), _jsxs("div", { className: "relative", children: [_jsx("input", { type: "number", value: depositInput, onChange: e => setDepositInput(e.target.value), className: "w-full bg-polkadot-dark border border-polkadot-border rounded-2xl px-5 py-4 text-xl font-mono text-white outline-none focus:border-polkadot-pink/40 shadow-inner" }), _jsx("span", { className: "absolute right-5 top-1/2 -translate-y-1/2 font-black text-[10px] text-gray-600 uppercase", children: "PAS" })] }), _jsx("button", { onClick: () => depositAction.execute({ address: LENDING_POOL, abi: POOL_ABI, functionName: 'deposit', value: parseEther(depositInput), gas: GAS.deposit }), className: "w-full py-5 bg-polkadot-pink text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-[1.02] transition-all shadow-xl shadow-polkadot-pink/20", children: "Confirm Deposit" }), _jsx(ActionFeedback, { status: depositAction.status, txError: depositAction.txError })] }), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-[40px] p-8 space-y-6 shadow-xl", children: [_jsx("h3", { className: "text-[10px] text-gray-500 font-black uppercase tracking-widest", children: "2. Draw Liquidity" }), _jsxs("div", { className: "relative", children: [_jsx("input", { type: "number", value: borrowInput, onChange: e => setBorrowInput(e.target.value), className: "w-full bg-polkadot-dark border border-polkadot-border rounded-2xl px-5 py-4 text-xl font-mono text-white outline-none focus:border-polkadot-pink/40 shadow-inner" }), _jsx("span", { className: "absolute right-5 top-1/2 -translate-y-1/2 font-black text-[10px] text-gray-600 uppercase", children: "PAS" })] }), _jsx("button", { onClick: () => borrowAction.execute({ address: LENDING_POOL, abi: POOL_ABI, functionName: 'borrow', args: [parseEther(borrowInput)], gas: GAS.borrow }), className: "w-full py-5 bg-white/5 border border-white/10 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-white/10 transition-all shadow-xl", children: "Borrow Funds" }), _jsx(ActionFeedback, { status: borrowAction.status, txError: borrowAction.txError })] })] }), _jsxs("div", { className: "bg-polkadot-card border border-red-500/20 rounded-[40px] p-10 space-y-8 shadow-2xl", children: [_jsxs("div", { className: "flex justify-between items-center", children: [_jsx("h3", { className: "text-[10px] text-red-500 font-black uppercase tracking-[0.3em]", children: "Liquidation Engine" }), _jsx("span", { className: "bg-red-500/10 text-red-500 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter border border-red-500/20", children: "5% Bounty Active" })] }), _jsxs("div", { className: "flex gap-4", children: [_jsx("input", { type: "text", placeholder: "BORROWER IDENTITY (0x...)", value: liqTarget, onChange: e => lookupLiqTarget(e.target.value), className: "flex-1 bg-polkadot-dark border border-polkadot-border rounded-2xl px-6 py-5 text-sm font-mono text-white outline-none focus:border-red-500/40 shadow-inner" }), _jsx("button", { onClick: () => liqAction.execute({ address: LENDING_POOL, abi: POOL_ABI, functionName: 'liquidate', args: [liqTarget], value: liqTargetDebt + parseEther('0.001'), gas: GAS.liquidate }), disabled: !liqStatus?.ok, className: "bg-red-600 disabled:bg-gray-800 text-white px-10 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl active:scale-95", children: "Liquidate" })] }), liqStatus && _jsx("div", { className: `text-[10px] font-black uppercase tracking-widest text-center ${liqStatus.ok ? 'text-emerald-400 animate-pulse' : 'text-gray-700'}`, children: liqStatus.detail }), _jsx(ActionFeedback, { status: liqAction.status, txError: liqAction.txError })] })] })] })] }));
}
