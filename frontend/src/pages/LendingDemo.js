import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useBalance, useSwitchChain, useChainId, } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { pasTestnet } from '../utils/wagmi.js';
// ── Contract config ───────────────────────────────────────────────────────────
const LENDING_POOL = (import.meta.env.VITE_LENDING_POOL ?? '');
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
];
// ── Helpers ───────────────────────────────────────────────────────────────────
const MAX_HF = BigInt('0x' + 'f'.repeat(64));
function fmtPas(wei, dp = 6) {
    const v = parseFloat(formatEther(wei));
    if (v === 0)
        return '0';
    if (v < 0.000001)
        return '<0.000001';
    return v.toFixed(dp).replace(/\.?0+$/, '');
}
function fmtHF(hf) {
    if (hf === MAX_HF)
        return '∞';
    const v = parseFloat(formatEther(hf));
    return v.toFixed(3);
}
function hfColor(hf) {
    if (hf === MAX_HF)
        return 'text-gray-400';
    const v = parseFloat(formatEther(hf));
    if (v >= 2)
        return 'text-green-400';
    if (v >= 1.2)
        return 'text-yellow-400';
    if (v >= 1)
        return 'text-orange-400';
    return 'text-red-400';
}
function tierColor(tier) {
    return tier === 'excellent' ? 'text-green-400'
        : tier === 'good' ? 'text-yellow-400'
            : tier === 'fair' ? 'text-orange-400'
                : 'text-red-400';
}
function tierBorder(tier) {
    return tier === 'excellent' ? 'border-green-800'
        : tier === 'good' ? 'border-yellow-800'
            : tier === 'fair' ? 'border-orange-800'
                : 'border-red-800';
}
function fmt(ts) {
    return new Date(ts * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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
        pollingInterval: 3_000,
    });
    useEffect(() => {
        if (!pendingHash)
            return;
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
    const execute = useCallback(async (args) => {
        setStatus('signing');
        setTxError(null);
        try {
            // If wallet is on wrong chain, try to switch first
            if (chainId !== pasTestnet.id) {
                try {
                    await switchChainAsync({ chainId: pasTestnet.id });
                }
                catch (switchErr) {
                    const switchMsg = switchErr?.message ?? '';
                    // Chain not added to MetaMask yet — add it manually via window.ethereum
                    if (switchMsg.includes('Unrecognized chain') || switchMsg.includes('4902') || switchMsg.includes('not been added')) {
                        await window.ethereum?.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                    chainId: '0x' + pasTestnet.id.toString(16),
                                    chainName: pasTestnet.name,
                                    nativeCurrency: pasTestnet.nativeCurrency,
                                    rpcUrls: [pasTestnet.rpcUrls.default.http[0]],
                                    blockExplorerUrls: [pasTestnet.blockExplorers.default.url],
                                }],
                        });
                    }
                    else {
                        throw switchErr;
                    }
                }
                // After switch/add — verify we are actually on the right chain now
                const currentChainId = await window.ethereum?.request({ method: 'eth_chainId' });
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
        }
        catch (err) {
            const msg = err?.message ?? 'Unknown error';
            setTxError(msg.includes('User rejected') ? 'Transaction rejected in wallet'
                : msg.includes('insufficient') ? 'Insufficient PAS balance'
                    : msg.length > 120 ? msg.slice(0, 120) + '…'
                        : msg);
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
function ActionFeedback({ status, txError }) {
    if (status === 'idle')
        return null;
    if (status === 'signing')
        return (_jsxs("div", { className: "flex items-center gap-2 text-xs text-yellow-300 bg-yellow-950 border border-yellow-800 rounded-xl px-3 py-2", children: [_jsx(Spinner, {}), " Check MetaMask to confirm\u2026"] }));
    if (status === 'mining')
        return (_jsxs("div", { className: "flex items-center gap-2 text-xs text-blue-300 bg-blue-950 border border-blue-800 rounded-xl px-3 py-2", children: [_jsx(Spinner, {}), " Mining\u2026"] }));
    if (status === 'done')
        return (_jsx("div", { className: "text-xs text-green-300 bg-green-950 border border-green-800 rounded-xl px-3 py-2", children: "\u2713 Transaction confirmed" }));
    if (status === 'error')
        return (_jsxs("div", { className: "text-xs text-red-400 bg-red-950 border border-red-800 rounded-xl px-3 py-2", children: ["\u26A0 ", txError] }));
    return null;
}
// ── HealthBar ─────────────────────────────────────────────────────────────────
function HealthBar({ hf, liqThreshBps }) {
    if (hf === MAX_HF)
        return (_jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "flex justify-between text-xs text-gray-500", children: [_jsx("span", { children: "Health Factor" }), _jsx("span", { children: "\u2014" })] }), _jsx("div", { className: "h-2 bg-polkadot-border rounded-full" }), _jsx("div", { className: "text-xs text-gray-600 text-center", children: "No active debt" })] }));
    const hfVal = parseFloat(formatEther(hf));
    const liqHF = 10000 / liqThreshBps; // HF at liquidation: collateral/collateral*(liqThresh) = 1/liqThresh
    // clamp display to 0–3 range
    const pct = Math.min(100, (hfVal / 3) * 100);
    const color = hfVal >= 2 ? 'bg-green-500' : hfVal >= 1.2 ? 'bg-yellow-500' : hfVal >= 1 ? 'bg-orange-500' : 'bg-red-500';
    return (_jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "flex justify-between text-xs", children: [_jsx("span", { className: "text-gray-500", children: "Health Factor" }), _jsx("span", { className: hfColor(hf) + ' font-mono font-bold', children: fmtHF(hf) })] }), _jsx("div", { className: "h-2 bg-polkadot-border rounded-full overflow-hidden", children: _jsx("div", { className: `h-full rounded-full transition-all duration-700 ${color}`, style: { width: `${pct}%` } }) }), _jsxs("div", { className: "flex justify-between text-[10px] text-gray-600", children: [_jsxs("span", { children: ["Liquidation at <", liqHF.toFixed(2)] }), _jsx("span", { className: hfVal < liqHF + 0.1 ? 'text-red-400 font-semibold' : '', children: hfVal < 1 ? '⚠ LIQUIDATABLE' : hfVal < liqHF + 0.1 ? '⚠ Approaching liq.' : 'Safe' })] })] }));
}
// ── Main component ────────────────────────────────────────────────────────────
const TIERS = [
    { label: 'Excellent', range: '750–1100', ltv: '90%', liq: '95%', apr: '5%', color: 'text-green-400', border: 'border-green-800' },
    { label: 'Good', range: '500–749', ltv: '75%', liq: '80%', apr: '8%', color: 'text-yellow-400', border: 'border-yellow-800' },
    { label: 'Fair', range: '250–499', ltv: '60%', liq: '65%', apr: '12%', color: 'text-orange-400', border: 'border-orange-800' },
    { label: 'Denied', range: '0–249', ltv: '—', liq: '—', apr: '—', color: 'text-red-400', border: 'border-red-800' },
];
export function LendingDemo() {
    const { address, isConnected } = useAccount();
    const chainIdComp = useChainId();
    const { switchChain: switchChainComp } = useSwitchChain();
    const isWrongNetwork = isConnected && chainIdComp !== pasTestnet.id;
    async function addAndSwitchToPAS() {
        try {
            await window.ethereum?.request({
                method: 'wallet_addEthereumChain',
                params: [{
                        chainId: '0x' + pasTestnet.id.toString(16),
                        chainName: pasTestnet.name,
                        nativeCurrency: pasTestnet.nativeCurrency,
                        rpcUrls: [pasTestnet.rpcUrls.default.http[0]],
                        blockExplorerUrls: [pasTestnet.blockExplorers.default.url],
                    }],
            });
        }
        catch {
            switchChainComp({ chainId: pasTestnet.id });
        }
    }
    // Inputs
    const [depositInput, setDepositInput] = useState('0.1');
    const [borrowInput, setBorrowInput] = useState('0.05');
    const [repayInput, setRepayInput] = useState('');
    const [withdrawInput, setWithdrawInput] = useState('');
    const [liqTarget, setLiqTarget] = useState('');
    const [liqTargetDebt, setLiqTargetDebt] = useState(0n);
    const [liqLookingUp, setLiqLookingUp] = useState(false);
    const [liqStatus, setLiqStatus] = useState(null);
    // Cancel token: prevents stale async responses from overwriting state
    // after the user has already cleared or changed the input field.
    const liqFetchId = useRef(0);
    // Pool stats from backend
    const [poolStats, setPoolStats] = useState(null);
    const [simResult, setSimResult] = useState(null);
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
    const pos = posRaw ? {
        collateral: posRaw[0],
        principal: posRaw[1],
        interestAccrued: posRaw[2],
        totalDebt: posRaw[3],
        healthFactor: posRaw[4],
        ltvBps: Number(posRaw[5]),
        liqThreshBps: Number(posRaw[6]),
        aprBps: Number(posRaw[7]),
        active: Boolean(posRaw[8]),
    } : null;
    // Treat sub-100-wei as zero — prevents the Repay section showing after a
    // full repay when 1–2 wei of interest accrues between the tx and the refetch.
    const DUST = 100n;
    const effectiveDebt = pos ? (pos.totalDebt <= DUST ? 0n : pos.totalDebt) : 0n;
    // Refetch everything after a transaction
    // Refresh pool stats (called after every tx via refetchAll)
    const refetchPoolStats = useCallback(() => {
        fetch('/lending/pool')
            .then(r => r.json()).then(setPoolStats).catch(() => { });
    }, []);
    const refetchAll = useCallback(() => {
        refetchPos();
        refetchLiq();
        refetchWithdrawable();
        refetchPoolStats();
    }, [refetchPos, refetchLiq, refetchWithdrawable, refetchPoolStats]);
    // ── Reset all local state when wallet changes ─────────────────────────────
    const prevLendAddr = useRef(undefined);
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
    const depositAction = usePoolAction(refetchAll);
    const borrowAction = usePoolAction(refetchAll);
    const repayAction = usePoolAction(refetchAll);
    const withdrawAction = usePoolAction(refetchAll);
    const liqAction = usePoolAction(refetchAll);
    // Fetch pool stats + simulate on mount / address change
    useEffect(() => {
        fetch('/lending/pool')
            .then(r => r.json()).then(setPoolStats).catch(() => { });
        if (address) {
            fetch(`/lending/simulate/${address}?amount=1000`)
                .then(r => r.json()).then(setSimResult).catch(() => { });
        }
    }, [address]);
    // ── Handlers ────────────────────────────────────────────────────────────────
    // ── Gas limits: explicit values bypass MetaMask's estimation on custom chains.
    // Measured on PAS TestNet + 50% buffer for safety. Unused gas is refunded.
    const GAS = {
        deposit: 120000n,
        borrow: 180000n,
        repay: 180000n,
        withdraw: 150000n,
        liquidate: 250000n,
    };
    function handleDeposit() {
        if (!address)
            return;
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
        if (!address)
            return;
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
        if (!address)
            return;
        repayAction.reset();
        const base = repayInput
            ? parseEther(repayInput)
            : effectiveDebt;
        // Buffer covers interest that accrues between position fetch and tx execution.
        // Contract refunds any excess automatically via _send(msg.sender, excess).
        const INTEREST_BUFFER = 1000000000000000n; // 0.001 PAS
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
        if (!address)
            return;
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
        if (!address || !liqTarget)
            return;
        if (!liqTarget.startsWith('0x') || liqTarget.length !== 42)
            return;
        liqAction.reset();
        setLiqLookingUp(true);
        let debt = liqTargetDebt;
        try {
            // Re-fetch the target's position from backend to get fresh debt
            const r = await fetch(`/lending/position/${liqTarget}`);
            const data = await r.json();
            if (data.success && data.totalDebtWei) {
                debt = BigInt(data.totalDebtWei);
                setLiqTargetDebt(debt);
            }
        }
        catch (_) { /* use stale value */ }
        setLiqLookingUp(false);
        if (debt === 0n) {
            liqAction.reset();
            return;
        }
        liqAction.execute({
            address: LENDING_POOL,
            abi: POOL_ABI,
            functionName: 'liquidate',
            args: [liqTarget],
            // Add 0.001 PAS buffer: interest accrues between fetch and tx execution.
            // liquidate() refunds any msg.value above the actual debt automatically.
            value: debt + 1000000000000000n,
            gas: GAS.liquidate,
        });
    }
    async function lookupLiqTarget(addr) {
        setLiqTarget(addr);
        setLiqTargetDebt(0n);
        setLiqStatus(null);
        if (!addr.startsWith('0x') || addr.length !== 42)
            return;
        // Cancel token: increment so any in-flight fetch from prior keystrokes
        // can detect they're stale and discard their result.
        const fetchId = ++liqFetchId.current;
        setLiqLookingUp(true);
        try {
            const r = await fetch(`/lending/position/${addr}`);
            if (fetchId !== liqFetchId.current)
                return; // stale
            const data = await r.json();
            if (fetchId !== liqFetchId.current)
                return; // stale
            if (!data.success || !data.active) {
                setLiqStatus({ ok: false, reason: 'NoPosition', detail: 'No active position found for this address.' });
                return;
            }
            const debt = BigInt(data.totalDebtWei ?? '0');
            const col = BigInt(data.collateralWei ?? '0');
            const bps = BigInt(data.liqThreshBps ?? 6500);
            const threshold = (col * bps) / 10000n;
            if (debt === 0n) {
                setLiqStatus({ ok: false, reason: 'NoDebt', detail: 'Position has zero debt — nothing to liquidate.' });
                return;
            }
            const scoreGone = !data.scoreValid;
            const overThresh = debt > threshold;
            if (scoreGone || overThresh) {
                setLiqTargetDebt(debt);
                setLiqStatus({ ok: true, debt });
                return;
            }
            // Healthy — explain with countdown
            const now = Math.floor(Date.now() / 1000);
            const secsLeft = (data.scoreExpires ?? 0) - now;
            const minsLeft = Math.ceil(secsLeft / 60);
            const detail = secsLeft > 0
                ? `Score valid for ${minsLeft} more min${minsLeft !== 1 ? 's' : ''}. Liquidation unlocks when it expires.`
                : 'Position is healthy — debt is below the liquidation threshold.';
            setLiqStatus({ ok: false, reason: secsLeft > 0 ? 'ScoreValid' : 'Healthy', detail });
        }
        catch {
            if (fetchId !== liqFetchId.current)
                return;
            setLiqStatus({ ok: false, reason: 'NoPosition', detail: 'Could not reach server — is the backend running?' });
        }
        finally {
            if (fetchId === liqFetchId.current)
                setLiqLookingUp(false);
        }
    }
    const poolLiquidity = poolLiqRaw;
    const withdrawable = withdrawableRaw;
    const tierStr = simResult?.tier ?? 'denied';
    // ── Render ──────────────────────────────────────────────────────────────────
    if (!LENDING_POOL) {
        return (_jsxs("div", { className: "max-w-2xl mx-auto px-4 py-20 text-center space-y-4", children: [_jsx("div", { className: "text-4xl", children: "\uD83C\uDFD7\uFE0F" }), _jsx("div", { className: "text-gray-300 font-medium", children: "Lending Pool Not Deployed" }), _jsxs("div", { className: "text-gray-500 text-sm", children: ["Run ", _jsx("code", { className: "text-polkadot-pink bg-polkadot-dark px-2 py-0.5 rounded", children: "npm run deploy:lending" }), " in the contracts directory, then set ", _jsx("code", { className: "text-polkadot-pink", children: "VITE_LENDING_POOL" }), " in your frontend ", _jsx("code", { children: ".env" }), "."] })] }));
    }
    return (_jsxs("div", { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-10 space-y-8", children: [_jsxs("div", { className: "text-center space-y-2", children: [_jsxs("div", { className: "inline-flex items-center gap-2 bg-polkadot-card border border-polkadot-border rounded-full px-4 py-1.5 text-xs text-gray-400 mb-2", children: [_jsx("span", { className: "w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse" }), "Live On-Chain Lending"] }), _jsxs("h2", { className: "text-3xl font-bold", children: ["VeraScore ", _jsx("span", { className: "text-polkadot-pink", children: "Lending Pool" })] }), _jsx("p", { className: "text-gray-400 text-sm max-w-xl mx-auto", children: "Deposit PAS collateral and borrow against your VeraScore. LTV, interest rate, and liquidation threshold are all gated by your score." })] }), _jsx("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3", children: TIERS.map(t => (_jsxs("div", { className: `bg-polkadot-card border ${t.border} rounded-2xl p-4 text-center space-y-1.5`, children: [_jsx("div", { className: `text-sm font-semibold ${t.color}`, children: t.label }), _jsx("div", { className: "text-gray-500 text-xs", children: t.range }), _jsx("div", { className: `text-lg font-bold ${t.color}`, children: t.ltv }), _jsx("div", { className: "text-gray-600 text-xs", children: "Max LTV" }), _jsxs("div", { className: "grid grid-cols-2 gap-1 pt-1 border-t border-polkadot-border text-[10px]", children: [_jsxs("div", { className: "text-gray-600", children: ["Liq. ", _jsx("span", { className: t.color, children: t.liq })] }), _jsxs("div", { className: "text-gray-600", children: ["APR ", _jsx("span", { className: t.color, children: t.apr })] })] })] }, t.label))) }), poolStats?.success && (_jsx("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs", children: [
                    ['Pool Liquidity', poolStats.liquidity + ' PAS'],
                    ['Total Collateral', poolStats.totalCollateral + ' PAS'],
                    ['Total Borrowed', poolStats.totalBorrowed + ' PAS'],
                    ['Utilisation', poolStats.utilisationPct + '%'],
                ].map(([label, val]) => (_jsxs("div", { className: "text-center", children: [_jsx("div", { className: "text-gray-500 mb-0.5", children: label }), _jsx("div", { className: "text-white font-mono font-semibold", children: val })] }, label))) })), isWrongNetwork && (_jsxs("div", { className: "flex items-center justify-between bg-yellow-900/40 border border-yellow-500/50 rounded-xl px-5 py-3 text-sm", children: [_jsxs("span", { className: "text-yellow-300 font-medium", children: ["\u26A0\uFE0F Wrong network detected. Switch to ", _jsx("strong", { children: "Polkadot Hub TestNet" }), " to transact."] }), _jsx("button", { onClick: addAndSwitchToPAS, className: "ml-4 shrink-0 bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-4 py-1.5 rounded-lg text-xs transition", children: "Switch Network" })] })), !isConnected ? (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl p-10 text-center space-y-3", children: [_jsx("div", { className: "text-4xl", children: "\uD83D\uDD10" }), _jsx("div", { className: "text-gray-300 font-medium", children: "Connect your wallet to use the lending pool" }), _jsx("div", { className: "text-gray-500 text-sm", children: "Click \"Connect Wallet\" in the top-right corner" })] })) : (_jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6", children: [_jsx("div", { className: "space-y-4", children: _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsxs("div", { className: "px-5 py-4 border-b border-polkadot-border flex items-center justify-between", children: [_jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "Your Position" }), simResult?.score != null && (_jsxs("span", { className: `text-xs font-semibold px-2.5 py-1 rounded-full border ${tierBorder(tierStr)} ${tierColor(tierStr)} bg-opacity-10`, children: [simResult.label ?? 'Denied', " \u00B7 Score ", simResult.score] }))] }), _jsxs("div", { className: "p-5 space-y-4", children: [_jsxs("div", { className: "flex justify-between items-center text-xs", children: [_jsx("span", { className: "text-gray-500", children: "Wallet Balance" }), _jsxs("span", { className: "font-mono text-gray-300", children: [walletBalance ? fmtPas(walletBalance.value) : '—', " PAS"] })] }), _jsx("div", { className: "grid grid-cols-2 gap-3", children: [
                                                ['Collateral', pos ? fmtPas(pos.collateral) + ' PAS' : '—'],
                                                ['Debt', pos ? fmtPas(pos.totalDebt) + ' PAS' : '—'],
                                                ['Principal', pos ? fmtPas(pos.principal) + ' PAS' : '—'],
                                                ['Interest', pos ? fmtPas(pos.interestAccrued) + ' PAS' : '—'],
                                                ['LTV', pos ? (pos.ltvBps / 100) + '%' : '—'],
                                                ['APR', pos ? (pos.aprBps / 100) + '%' : '—'],
                                            ].map(([label, val]) => (_jsxs("div", { className: "bg-polkadot-dark rounded-xl px-3 py-2.5 space-y-0.5", children: [_jsx("div", { className: "text-[10px] text-gray-600 uppercase tracking-wider", children: label }), _jsx("div", { className: "text-sm font-mono text-gray-200", children: val })] }, label))) }), pos && pos.active && (_jsx(HealthBar, { hf: pos.healthFactor, liqThreshBps: pos.liqThreshBps })), simResult && (_jsx("div", { className: `rounded-xl px-4 py-3 text-xs border ${!simResult.hasScore ? 'bg-gray-950 border-gray-800 text-gray-400' :
                                                !simResult.isValid ? 'bg-red-950 border-red-800 text-red-400' :
                                                    !simResult.eligible ? 'bg-red-950 border-red-800 text-red-400' :
                                                        'bg-green-950 border-green-800 text-green-300'}`, children: !simResult.hasScore ? '🔍 No VeraScore found — go to Score tab to generate one' :
                                                !simResult.isValid ? '⏱ VeraScore expired — refresh to restore lending access' :
                                                    !simResult.eligible ? '✕ Score below 250 — build more on-chain history' :
                                                        simResult.scoreExpires ? `✓ Score valid until ${fmt(simResult.scoreExpires)}` : '✓ Score valid' }))] })] }) }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl p-5 space-y-3", children: [_jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "Deposit Collateral" }), _jsxs("div", { className: "flex gap-2", children: [_jsxs("div", { className: "relative flex-1", children: [_jsx("input", { type: "number", min: "0.001", step: "0.01", placeholder: "0.1", value: depositInput, onChange: e => setDepositInput(e.target.value), className: "w-full bg-polkadot-dark border border-polkadot-border rounded-xl px-4 py-3 pr-14 text-sm font-mono text-white focus:outline-none focus:border-polkadot-pink transition-colors" }), _jsx("span", { className: "absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500", children: "PAS" })] }), _jsx("button", { onClick: handleDeposit, disabled: depositAction.status === 'signing' || depositAction.status === 'mining' || !simResult?.eligible, className: "bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-3 rounded-xl transition-colors text-sm", children: depositAction.status === 'signing' || depositAction.status === 'mining' ? _jsx(Spinner, {}) : 'Deposit' })] }), _jsx(ActionFeedback, { status: depositAction.status, txError: depositAction.txError }), poolLiquidity !== undefined && (_jsxs("div", { className: "text-xs text-gray-600", children: ["Pool available: ", fmtPas(poolLiquidity), " PAS"] }))] }), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl p-5 space-y-3", children: [_jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "Borrow" }), simResult?.eligible && simResult.ltvPct != null && pos && (_jsxs("div", { className: "text-xs text-gray-500", children: ["Max borrow on ", fmtPas(pos.collateral), " PAS collateral:", ' ', _jsxs("span", { className: `font-mono ${tierColor(tierStr)}`, children: [fmtPas(pos.collateral * BigInt(simResult.ltvPct) / 100n), " PAS"] })] })), _jsxs("div", { className: "flex gap-2", children: [_jsxs("div", { className: "relative flex-1", children: [_jsx("input", { type: "number", min: "0.0001", step: "0.01", placeholder: "0.05", value: borrowInput, onChange: e => setBorrowInput(e.target.value), className: "w-full bg-polkadot-dark border border-polkadot-border rounded-xl px-4 py-3 pr-14 text-sm font-mono text-white focus:outline-none focus:border-polkadot-pink transition-colors" }), _jsx("span", { className: "absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500", children: "PAS" })] }), _jsx("button", { onClick: handleBorrow, disabled: borrowAction.status === 'signing' || borrowAction.status === 'mining' || !simResult?.eligible || !pos?.active, className: "bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-3 rounded-xl transition-colors text-sm", children: borrowAction.status === 'signing' || borrowAction.status === 'mining' ? _jsx(Spinner, {}) : 'Borrow' })] }), _jsx(ActionFeedback, { status: borrowAction.status, txError: borrowAction.txError })] }), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl p-5 space-y-3", children: [_jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "Repay" }), pos?.active && effectiveDebt > 0n ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "text-xs text-gray-500", children: ["Outstanding debt: ", _jsxs("span", { className: "font-mono text-red-400", children: [fmtPas(effectiveDebt), " PAS"] })] }), _jsxs("div", { className: "flex gap-2", children: [_jsxs("div", { className: "relative flex-1", children: [_jsx("input", { type: "number", min: "0", step: "0.001", placeholder: fmtPas(effectiveDebt), value: repayInput, onChange: e => setRepayInput(e.target.value), className: "w-full bg-polkadot-dark border border-polkadot-border rounded-xl px-4 py-3 pr-14 text-sm font-mono text-white focus:outline-none focus:border-polkadot-pink transition-colors placeholder-gray-700" }), _jsx("span", { className: "absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500", children: "PAS" })] }), _jsx("button", { onClick: handleRepay, disabled: repayAction.status === 'signing' || repayAction.status === 'mining', className: "bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-3 rounded-xl transition-colors text-sm", children: repayAction.status === 'signing' || repayAction.status === 'mining' ? _jsx(Spinner, {}) : 'Repay' })] }), _jsx("div", { className: "text-xs text-gray-600", children: "Leave blank to repay full balance" }), _jsx(ActionFeedback, { status: repayAction.status, txError: repayAction.txError })] })) : (_jsx("div", { className: "text-xs text-gray-600 py-1", children: pos?.active ? 'No outstanding debt.' : 'No active position.' }))] }), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl p-5 space-y-3", children: [_jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "Withdraw Collateral" }), pos?.active && withdrawable !== undefined && withdrawable > 0n ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "text-xs text-gray-500", children: ["Withdrawable: ", _jsxs("span", { className: "font-mono text-gray-300", children: [fmtPas(withdrawable), " PAS"] })] }), _jsxs("div", { className: "flex gap-2", children: [_jsxs("div", { className: "relative flex-1", children: [_jsx("input", { type: "number", min: "0", step: "0.01", placeholder: fmtPas(withdrawable), value: withdrawInput, onChange: e => setWithdrawInput(e.target.value), className: "w-full bg-polkadot-dark border border-polkadot-border rounded-xl px-4 py-3 pr-14 text-sm font-mono text-white focus:outline-none focus:border-polkadot-pink transition-colors placeholder-gray-700" }), _jsx("span", { className: "absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500", children: "PAS" })] }), _jsx("button", { onClick: handleWithdraw, disabled: withdrawAction.status === 'signing' || withdrawAction.status === 'mining', className: "bg-yellow-700 hover:bg-yellow-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-3 rounded-xl transition-colors text-sm", children: withdrawAction.status === 'signing' || withdrawAction.status === 'mining' ? _jsx(Spinner, {}) : 'Withdraw' })] }), _jsx(ActionFeedback, { status: withdrawAction.status, txError: withdrawAction.txError })] })) : (_jsx("div", { className: "text-xs text-gray-600 py-1", children: !pos?.active
                                            ? 'No active position.'
                                            : 'No collateral available to withdraw — repay debt first.' }))] }), _jsxs("div", { className: "bg-polkadot-card border border-red-900 rounded-2xl p-5 space-y-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "Liquidate a Position" }), _jsx("span", { className: "text-xs text-red-500 border border-red-900 px-2 py-0.5 rounded-full", children: "+5% bonus" })] }), _jsx("div", { className: "text-xs text-gray-600", children: "Repay an unhealthy borrower's debt and receive their collateral + 5% bonus. Position must have expired score or debt above the liquidation threshold." }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { type: "text", placeholder: "0x... borrower address", value: liqTarget, onChange: e => lookupLiqTarget(e.target.value), className: "flex-1 bg-polkadot-dark border border-polkadot-border rounded-xl px-4 py-3 text-sm font-mono text-white focus:outline-none focus:border-red-600 transition-colors placeholder-gray-700" }), _jsx("button", { onClick: handleLiquidate, disabled: liqAction.status === 'signing' || liqAction.status === 'mining' || liqLookingUp || !liqStatus || !liqStatus.ok, className: "bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-3 rounded-xl transition-colors text-sm", children: liqAction.status === 'signing' || liqAction.status === 'mining' || liqLookingUp ? _jsx(Spinner, {}) : 'Liquidate' })] }), liqTarget.length === 42 && liqTarget.startsWith('0x') && !liqLookingUp && liqStatus && (liqStatus.ok ? (_jsxs("div", { className: "text-xs text-green-400 bg-green-950 border border-green-900 rounded-lg px-3 py-2 space-y-0.5", children: [_jsx("div", { className: "font-semibold", children: "\u2705 Liquidatable now" }), _jsxs("div", { children: ["Debt: ", _jsxs("span", { className: "font-mono", children: [fmtPas(liqStatus.debt), " PAS"] }), " \u2014 this amount will be charged from your wallet"] }), _jsx("div", { className: "text-green-600", children: "You receive: collateral + 5% bonus" })] })) : liqStatus.reason === 'ScoreValid' ? (_jsxs("div", { className: "text-xs text-yellow-400 bg-yellow-950 border border-yellow-900 rounded-lg px-3 py-2 space-y-0.5", children: [_jsx("div", { className: "font-semibold", children: "\u23F3 Not yet liquidatable" }), _jsx("div", { children: liqStatus.detail })] })) : liqStatus.reason === 'Healthy' ? (_jsxs("div", { className: "text-xs text-blue-400 bg-blue-950 border border-blue-900 rounded-lg px-3 py-2", children: [_jsx("div", { className: "font-semibold", children: "\uD83D\uDC99 Position is healthy" }), _jsx("div", { children: liqStatus.detail })] })) : (_jsx("div", { className: "text-xs text-gray-500 bg-polkadot-dark border border-polkadot-border rounded-lg px-3 py-2", children: liqStatus.detail }))), _jsx(ActionFeedback, { status: liqAction.status, txError: liqAction.txError })] })] })] })), _jsxs("div", { className: "text-center text-xs text-gray-600 pt-2", children: ["Contract:", ' ', _jsxs("a", { href: `https://polkadot.testnet.routescan.io/address/${LENDING_POOL}`, target: "_blank", rel: "noopener noreferrer", className: "font-mono text-gray-500 hover:text-polkadot-pink transition-colors", children: [LENDING_POOL, "\u2197"] })] })] }));
}
