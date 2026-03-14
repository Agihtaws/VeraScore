import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useBalance, useSwitchChain, useChainId, } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { pasTestnet } from '../utils/wagmi.js';
const LENDING_POOL = (import.meta.env.VITE_LENDING_POOL ?? '');
const EXPLORER = 'https://polkadot.testnet.routescan.io';
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''; // Add this
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
const MAX_HF = BigInt('0x' + 'f'.repeat(64));
const DUST = parseEther('0.0001');
const TIERS = [
    { label: 'Excellent', range: '800–1100', ltv: '90%', apr: '5%', color: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/5' },
    { label: 'Good', range: '500–799', ltv: '75%', apr: '8%', color: 'text-yellow-400', border: 'border-yellow-500/20', bg: 'bg-yellow-500/5' },
    { label: 'Fair', range: '250–499', ltv: '60%', apr: '12%', color: 'text-orange-400', border: 'border-orange-500/20', bg: 'bg-orange-500/5' },
    { label: 'Denied', range: '0–249', ltv: '—', apr: '—', color: 'text-red-400', border: 'border-red-500/20', bg: 'bg-red-500/5' },
];
const GAS = { deposit: 120000n, borrow: 180000n, repay: 180000n, withdraw: 150000n, liquidate: 250000n };
function fmtPas(wei) {
    const v = parseFloat(formatEther(wei));
    if (v === 0)
        return '0';
    if (v < 0.001)
        return '<0.001';
    return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
}
function fmtHF(hf) {
    if (hf === MAX_HF)
        return '∞';
    return parseFloat(formatEther(hf)).toFixed(3);
}
function hfColor(hf) {
    if (hf === MAX_HF)
        return 'text-gray-500';
    const v = parseFloat(formatEther(hf));
    if (v >= 2)
        return 'text-emerald-400';
    if (v >= 1.2)
        return 'text-yellow-400';
    return 'text-red-400';
}
function usePoolAction(onSuccess) {
    const [status, setStatus] = useState('idle');
    const [txError, setTxError] = useState(null);
    const [pendingHash, setPendingHash] = useState(undefined);
    const { writeContractAsync } = useWriteContract();
    const { switchChainAsync } = useSwitchChain();
    const chainId = useChainId();
    const { isSuccess, isError, error: receiptError } = useWaitForTransactionReceipt({ hash: pendingHash, confirmations: 1 });
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
            if (chainId !== pasTestnet.id)
                await switchChainAsync({ chainId: pasTestnet.id });
            const hash = await writeContractAsync(args);
            setPendingHash(hash);
            setStatus('mining');
        }
        catch (err) {
            const msg = err?.message ?? '';
            setStatus('error');
            setTxError(msg.includes('User rejected') ? 'Rejected in wallet' : msg.slice(0, 120));
        }
    }, [writeContractAsync, switchChainAsync, chainId]);
    const reset = useCallback(() => { setStatus('idle'); setTxError(null); setPendingHash(undefined); }, []);
    return { status, txError, execute, reset };
}
function ActionFeedback({ status, txError }) {
    if (status === 'idle')
        return null;
    if (status === 'signing')
        return _jsx("p", { className: "text-[9px] font-bold text-yellow-400 animate-pulse uppercase tracking-widest", children: "Check MetaMask\u2026" });
    if (status === 'mining')
        return _jsx("p", { className: "text-[9px] font-bold text-blue-400 animate-pulse uppercase tracking-widest", children: "Mining on Hub\u2026" });
    if (status === 'done')
        return _jsx("p", { className: "text-[9px] font-bold text-emerald-400 uppercase tracking-widest", children: "\u2713 Confirmed" });
    if (status === 'error')
        return _jsxs("p", { className: "text-[9px] font-bold text-red-400 uppercase tracking-widest break-words", children: ["\u2717 ", txError] });
    return null;
}
function HealthBar({ hf, liqThreshBps }) {
    if (hf === MAX_HF)
        return (_jsxs("div", { className: "space-y-1", children: [_jsxs("div", { className: "flex justify-between text-[8px] font-bold uppercase tracking-widest text-gray-600", children: [_jsx("span", { children: "Health Factor" }), _jsx("span", { children: "\u221E" })] }), _jsx("div", { className: "h-1 bg-black/40 rounded-full border border-white/5" })] }));
    const hfVal = parseFloat(formatEther(hf));
    const pct = Math.min(100, (hfVal / 3) * 100);
    const color = hfVal >= 2 ? 'bg-emerald-500' : hfVal >= 1.2 ? 'bg-yellow-500' : 'bg-red-500';
    return (_jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "flex justify-between text-[8px] font-bold uppercase tracking-widest", children: [_jsx("span", { className: "text-gray-600", children: "Health Factor" }), _jsx("span", { className: `${hfColor(hf)} font-mono`, children: fmtHF(hf) })] }), _jsx("div", { className: "h-1 bg-black/40 rounded-full overflow-hidden border border-white/5", children: _jsx("div", { className: `h-full rounded-full transition-all duration-700 ${color}`, style: { width: `${pct}%` } }) }), _jsxs("p", { className: "text-[8px] text-gray-700 uppercase tracking-widest", children: ["Liquidation at ", liqThreshBps / 100, "% LTV \u00B7 keep above 1.2"] })] }));
}
// ── Action card ────────────────────────────────────────────────────────────
function ActionCard({ title, accent, children }) {
    return (_jsxs("div", { className: `bg-polkadot-card border rounded-2xl overflow-hidden shadow-xl ${accent ?? 'border-polkadot-border'}`, children: [_jsx("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20", children: _jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-gray-500", children: title }) }), _jsx("div", { className: "px-4 py-4 space-y-3", children: children })] }));
}
function PasInput({ value, onChange, placeholder, disabled }) {
    return (_jsxs("div", { className: "relative", children: [_jsx("input", { type: "number", value: value, onChange: e => onChange(e.target.value), placeholder: placeholder ?? '0.00', disabled: disabled, className: "w-full bg-polkadot-dark border border-polkadot-border rounded-xl px-4 py-2.5 text-sm font-mono text-white outline-none focus:border-polkadot-pink/40 placeholder-gray-700 disabled:opacity-40 disabled:cursor-not-allowed" }), _jsx("span", { className: "absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-gray-700 uppercase", children: "PAS" })] }));
}
// ── Main ───────────────────────────────────────────────────────────────────
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
    // Local validation errors for repay/withdraw
    const [repayError, setRepayError] = useState(null);
    const [withdrawError, setWithdrawError] = useState(null);
    const [poolStats, setPoolStats] = useState(null);
    const [simResult, setSimResult] = useState(null);
    const [simLoading, setSimLoading] = useState(false);
    const { data: posRaw, refetch: refetchPos } = useReadContract({
        address: LENDING_POOL, abi: POOL_ABI, functionName: 'getPosition',
        args: [address ?? '0x0000000000000000000000000000000000000000'],
        query: { enabled: !!address, refetchInterval: 12_000 },
    });
    const { data: withdrawableRaw, refetch: refetchWithdrawable } = useReadContract({
        address: LENDING_POOL, abi: POOL_ABI, functionName: 'withdrawableCollateral',
        args: [address ?? '0x0000000000000000000000000000000000000000'],
        query: { enabled: !!address, refetchInterval: 12_000 },
    });
    const { data: walletBalance } = useBalance({
        address, chainId: pasTestnet.id, query: { refetchInterval: 10_000 },
    });
    const pos = posRaw ? {
        collateral: posRaw[0], principal: posRaw[1],
        interestAccrued: posRaw[2], totalDebt: posRaw[3],
        healthFactor: posRaw[4], ltvBps: Number(posRaw[5]),
        liqThreshBps: Number(posRaw[6]), aprBps: Number(posRaw[7]),
        active: posRaw[8],
    } : null;
    const effectiveDebt = pos ? (pos.totalDebt <= DUST ? 0n : pos.totalDebt) : 0n;
    const withdrawableAmount = withdrawableRaw ? withdrawableRaw : 0n;
    const refetchAll = useCallback(() => {
        refetchPos();
        refetchWithdrawable();
        fetch(`${API_BASE}/lending/pool`) // Updated
            .then(r => r.json()).then(setPoolStats).catch(() => { });
        setRepayInput('');
        setWithdrawInput('');
        setRepayError(null);
        setWithdrawError(null);
    }, [refetchPos, refetchWithdrawable]);
    const depositAction = usePoolAction(refetchAll);
    const borrowAction = usePoolAction(refetchAll);
    const repayAction = usePoolAction(refetchAll);
    const withdrawAction = usePoolAction(refetchAll);
    const liqAction = usePoolAction(refetchAll);
    useEffect(() => {
        fetch(`${API_BASE}/lending/pool`) // Updated
            .then(r => r.json()).then(setPoolStats).catch(() => { });
        if (address) {
            setSimLoading(true);
            fetch(`${API_BASE}/lending/simulate/${address}?amount=1000`) // Updated
                .then(r => r.json())
                .then(data => { setSimResult(data); setSimLoading(false); })
                .catch(() => setSimLoading(false));
        }
    }, [address]);
    // Validate repay input
    useEffect(() => {
        if (!repayInput) {
            setRepayError(null);
            return;
        }
        try {
            const amountWei = parseEther(repayInput);
            if (amountWei > effectiveDebt) {
                setRepayError(`Maximum repay is ${fmtPas(effectiveDebt)} PAS`);
            }
            else {
                setRepayError(null);
            }
        }
        catch {
            setRepayError('Invalid amount');
        }
    }, [repayInput, effectiveDebt]);
    // Validate withdraw input
    useEffect(() => {
        if (!withdrawInput) {
            setWithdrawError(null);
            return;
        }
        try {
            const amountWei = parseEther(withdrawInput);
            if (amountWei > withdrawableAmount) {
                setWithdrawError(`Maximum withdraw is ${fmtPas(withdrawableAmount)} PAS`);
            }
            else {
                setWithdrawError(null);
            }
        }
        catch {
            setWithdrawError('Invalid amount');
        }
    }, [withdrawInput, withdrawableAmount]);
    async function lookupLiqTarget(addr) {
        setLiqTarget(addr);
        if (addr.length !== 42) {
            setLiqStatus(null);
            return;
        }
        const fetchId = ++liqFetchId.current;
        setLiqLookingUp(true);
        try {
            const r = await fetch(`${API_BASE}/lending/position/${addr}`); // Updated
            const data = await r.json();
            if (fetchId !== liqFetchId.current)
                return;
            if (!data.success || !data.active) {
                setLiqStatus({ ok: false, detail: 'No active position found.' });
            }
            else {
                const debt = BigInt(data.totalDebtWei ?? '0');
                if (debt === 0n) {
                    setLiqStatus({ ok: false, detail: 'Zero debt.' });
                }
                else if (!data.scoreValid || debt > (BigInt(data.collateralWei) * BigInt(data.liqThreshBps) / 10000n)) {
                    setLiqTargetDebt(debt);
                    setLiqStatus({ ok: true, detail: `Liquidatable! Debt: ${fmtPas(debt)} PAS` });
                }
                else {
                    setLiqStatus({ ok: false, detail: 'Position is healthy.' });
                }
            }
        }
        catch {
            setLiqStatus({ ok: false, detail: 'Lookup failed.' });
        }
        finally {
            if (fetchId === liqFetchId.current)
                setLiqLookingUp(false);
        }
    }
    const handleRepay = useCallback(() => {
        if (repayError)
            return;
        repayAction.execute({
            address: LENDING_POOL, abi: POOL_ABI, functionName: 'repay',
            value: parseEther(repayInput || '0'), gas: GAS.repay,
        });
    }, [repayAction, repayInput, repayError]);
    const handleWithdraw = useCallback(() => {
        if (withdrawError)
            return;
        withdrawAction.execute({
            address: LENDING_POOL, abi: POOL_ABI, functionName: 'withdraw',
            args: [parseEther(withdrawInput || '0')], gas: GAS.withdraw,
        });
    }, [withdrawAction, withdrawInput, withdrawError]);
    if (!LENDING_POOL)
        return (_jsx("div", { className: "p-20 text-center text-xs uppercase font-black text-gray-600 tracking-widest italic", children: "Lending Pool Not Deployed" }));
    return (_jsxs("div", { className: "max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-xl font-black tracking-tight text-white", children: ["VeraScore ", _jsx("span", { className: "text-polkadot-pink", children: "Lending" })] }), _jsx("p", { className: "text-[10px] text-gray-600 mt-0.5 font-medium", children: "Credit-gated liquidity \u00B7 Paseo Hub native" })] }), isWrongNetwork && (_jsxs("div", { className: "bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-4 py-3 flex items-center justify-between", children: [_jsx("span", { className: "text-xs text-yellow-400 font-semibold", children: "\u26A0 Switch to Paseo Hub" }), _jsx("button", { onClick: () => switchChain({ chainId: pasTestnet.id }), className: "text-xs bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-1.5 rounded-lg font-bold transition-colors", children: "Switch" })] })), _jsx("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-2", children: TIERS.map(t => (_jsxs("div", { className: `${t.bg} border ${t.border} rounded-2xl px-3 py-3 space-y-1`, children: [_jsx("div", { className: `text-[8px] font-black uppercase tracking-widest ${t.color}`, children: t.label }), _jsxs("div", { className: "text-lg font-black text-white tracking-tight", children: [t.ltv, " ", _jsx("span", { className: "text-[8px] text-gray-700 uppercase", children: "LTV" })] }), _jsxs("div", { className: "flex justify-between text-[8px] font-bold text-gray-700 uppercase pt-1.5 border-t border-white/5", children: [_jsxs("span", { children: ["APR: ", t.apr] }), _jsx("span", { className: "font-mono", children: t.range })] })] }, t.label))) }), poolStats?.success && (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsx("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20", children: _jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-gray-500", children: "Pool Stats" }) }), _jsx("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-px bg-polkadot-border", children: [
                            ['Liquidity', `${parseFloat(poolStats.liquidity).toFixed(4)} PAS`],
                            ['Collateral', `${parseFloat(poolStats.totalCollateral).toFixed(4)} PAS`],
                            ['Borrowed', `${parseFloat(poolStats.totalBorrowed).toFixed(4)} PAS`],
                            ['Utilisation', `${poolStats.utilisationPct}%`],
                        ].map(([l, v]) => (_jsxs("div", { className: "bg-polkadot-card px-4 py-3", children: [_jsx("div", { className: "text-[8px] font-bold uppercase tracking-widest text-gray-700", children: l }), _jsx("div", { className: "text-sm font-black font-mono text-white mt-0.5", children: v })] }, l))) })] })), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden shadow-xl", children: [_jsxs("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20 flex justify-between items-center", children: [_jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-gray-500", children: "Your Position" }), simResult?.score && (_jsxs("span", { className: "text-[9px] font-black text-polkadot-pink uppercase tracking-widest", children: ["Score: ", simResult.score] }))] }), _jsxs("div", { className: "px-4 py-4 space-y-4", children: [_jsx("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-2", children: [
                                    ['Collateral', pos ? `${fmtPas(pos.collateral)} PAS` : '—'],
                                    ['Total Debt', pos ? `${fmtPas(effectiveDebt)} PAS` : '—'],
                                    ['LTV Ratio', pos ? `${pos.ltvBps / 100}%` : '—'],
                                    ['Fixed APR', pos ? `${pos.aprBps / 100}%` : '—'],
                                ].map(([l, v]) => (_jsxs("div", { className: "bg-polkadot-dark border border-white/5 rounded-xl px-3 py-2.5", children: [_jsx("div", { className: "text-[8px] font-bold uppercase tracking-widest text-gray-700 mb-1", children: l }), _jsx("div", { className: "text-xs font-black font-mono text-white", children: v })] }, l))) }), pos?.active && _jsx(HealthBar, { hf: pos.healthFactor, liqThreshBps: pos.liqThreshBps }), walletBalance && (_jsxs("div", { className: "text-[9px] text-gray-700 font-mono", children: ["Wallet: ", _jsxs("span", { className: "text-gray-500", children: [parseFloat(formatEther(walletBalance.value)).toFixed(4), " PAS"] })] })), _jsx("div", { className: `rounded-xl px-3 py-2.5 text-[9px] font-bold uppercase tracking-widest text-center border ${simLoading
                                    ? 'bg-white/5 border-white/10 text-gray-500'
                                    : simResult?.eligible
                                        ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
                                        : simResult?.tier === 'expired'
                                            ? 'bg-yellow-500/5 border-yellow-500/20 text-yellow-400'
                                            : 'bg-red-500/5 border-red-500/20 text-red-400'}`, children: !isConnected ? '⚠ Connect wallet'
                                    : simLoading ? '⟳ Checking score…'
                                        : simResult?.eligible ? '✦ Eligible for Credit'
                                            : simResult?.tier === 'expired' ? '⚠ Score Expired — Refresh to Borrow'
                                                : simResult?.tier === 'no_score' ? '✗ No VeraScore — Mint First'
                                                    : simResult ? '✗ Score Below Minimum (250)'
                                                        : '⚠ Could not fetch score' }), isConnected && (simResult?.tier === 'expired' || simResult?.tier === 'no_score') && (_jsx("a", { href: "/", className: "block text-center text-[9px] text-polkadot-pink hover:opacity-70 uppercase tracking-widest", children: "\u2192 Go to Score page" }))] })] }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: [_jsxs(ActionCard, { title: "1. Supply Collateral", children: [_jsx(PasInput, { value: depositInput, onChange: setDepositInput }), _jsx("button", { onClick: () => depositAction.execute({
                                    address: LENDING_POOL, abi: POOL_ABI, functionName: 'deposit',
                                    value: parseEther(depositInput || '0'), gas: GAS.deposit,
                                }), disabled: !isConnected || depositAction.status === 'signing' || depositAction.status === 'mining', className: "w-full py-3 bg-polkadot-pink hover:bg-pink-600 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_10px_rgba(230,0,122,0.15)]", children: depositAction.status === 'mining' ? 'Mining…' : depositAction.status === 'signing' ? 'Confirm…' : 'Deposit' }), _jsx(ActionFeedback, { status: depositAction.status, txError: depositAction.txError })] }), _jsxs(ActionCard, { title: "2. Draw Liquidity", children: [_jsx(PasInput, { value: borrowInput, onChange: setBorrowInput }), _jsx("button", { onClick: () => borrowAction.execute({
                                    address: LENDING_POOL, abi: POOL_ABI, functionName: 'borrow',
                                    args: [parseEther(borrowInput || '0')], gas: GAS.borrow,
                                }), disabled: !isConnected || !simResult?.eligible || borrowAction.status === 'signing' || borrowAction.status === 'mining', className: "w-full py-3 bg-white/5 border border-white/10 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed", children: borrowAction.status === 'mining' ? 'Mining…' : borrowAction.status === 'signing' ? 'Confirm…' : 'Borrow' }), _jsx(ActionFeedback, { status: borrowAction.status, txError: borrowAction.txError })] }), _jsxs(ActionCard, { title: "3. Repay Debt", children: [effectiveDebt > 0n && (_jsxs("button", { onClick: () => setRepayInput(formatEther(effectiveDebt + effectiveDebt / 200n)), className: "text-[9px] font-bold text-polkadot-pink hover:opacity-70 uppercase tracking-widest", children: ["Max: ", fmtPas(effectiveDebt), " PAS"] })), _jsx(PasInput, { value: repayInput, onChange: setRepayInput, disabled: repayAction.status !== 'idle', placeholder: effectiveDebt > 0n ? fmtPas(effectiveDebt) : '0.00' }), repayError && _jsxs("p", { className: "text-[9px] font-bold text-red-400 uppercase tracking-widest", children: ["\u26A0 ", repayError] }), _jsx("button", { onClick: handleRepay, disabled: !isConnected || effectiveDebt === 0n || !repayInput || !!repayError || repayAction.status !== 'idle', className: "w-full py-3 bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed", children: repayAction.status === 'mining' ? 'Mining…' : repayAction.status === 'signing' ? 'Confirm…' : 'Repay' }), _jsx(ActionFeedback, { status: repayAction.status, txError: repayAction.txError })] }), _jsxs(ActionCard, { title: "4. Withdraw Collateral", children: [withdrawableAmount > 0n && (_jsxs("button", { onClick: () => setWithdrawInput(formatEther(withdrawableAmount)), className: "text-[9px] font-bold text-polkadot-pink hover:opacity-70 uppercase tracking-widest", children: ["Max: ", fmtPas(withdrawableAmount), " PAS"] })), _jsx(PasInput, { value: withdrawInput, onChange: setWithdrawInput, disabled: withdrawAction.status !== 'idle', placeholder: withdrawableAmount > 0n ? fmtPas(withdrawableAmount) : '0.00' }), withdrawError && _jsxs("p", { className: "text-[9px] font-bold text-red-400 uppercase tracking-widest", children: ["\u26A0 ", withdrawError] }), _jsx("button", { onClick: handleWithdraw, disabled: !isConnected || withdrawableAmount === 0n || !withdrawInput || !!withdrawError || withdrawAction.status !== 'idle', className: "w-full py-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed", children: withdrawAction.status === 'mining' ? 'Mining…' : withdrawAction.status === 'signing' ? 'Confirm…' : 'Withdraw' }), _jsx(ActionFeedback, { status: withdrawAction.status, txError: withdrawAction.txError })] })] }), _jsxs(ActionCard, { title: "Liquidation Engine", accent: "border-red-500/20", children: [_jsxs("div", { className: "flex items-center justify-between -mt-1", children: [_jsx("span", { className: "text-[8px] text-gray-700", children: "Repay unhealthy positions \u00B7 earn 5% bounty" }), _jsx("span", { className: "bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full text-[8px] font-black uppercase border border-red-500/20", children: "5% Bounty" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsxs("div", { className: "relative flex-1", children: [_jsx("input", { type: "text", placeholder: "Borrower address (0x\u2026)", value: liqTarget, onChange: e => lookupLiqTarget(e.target.value), className: "w-full bg-polkadot-dark border border-polkadot-border rounded-xl px-4 py-2.5 text-xs font-mono text-white outline-none focus:border-red-500/40 placeholder-gray-700" }), liqLookingUp && (_jsx("div", { className: "absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" }))] }), _jsx("button", { onClick: () => liqAction.execute({
                                    address: LENDING_POOL, abi: POOL_ABI, functionName: 'liquidate',
                                    args: [liqTarget],
                                    value: liqTargetDebt + parseEther('0.001'),
                                    gas: GAS.liquidate,
                                }), disabled: !liqStatus?.ok || liqAction.status === 'signing' || liqAction.status === 'mining', className: "bg-red-600 hover:bg-red-500 disabled:bg-gray-800 disabled:text-gray-600 text-white px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:cursor-not-allowed", children: liqAction.status === 'mining' ? '…' : 'Liquidate' })] }), liqStatus && (_jsx("p", { className: `text-[9px] font-bold uppercase tracking-widest ${liqStatus.ok ? 'text-emerald-400 animate-pulse' : 'text-gray-600'}`, children: liqStatus.detail })), _jsx(ActionFeedback, { status: liqAction.status, txError: liqAction.txError })] })] }));
}
