'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient, useGasPrice, useBalance, useChainId, } from 'wagmi';
import { parseEther, formatUnits } from 'viem';
import { pasTestnet } from '../utils/wagmi';
/* ─── contract references ─────────────────────────────────────── */
const LENDING_POOL = (import.meta.env.VITE_LENDING_POOL ?? '');
const ZERO_ADDR = '0x0000000000000000000000000000000000000001';
const EXPLORER = 'https://polkadot.testnet.routescan.io';
/* ─── PAS price (testnet mock, user-adjustable) ───────────────── */
const DEFAULT_PAS_USD = 6.5;
const TX_TYPES = [
    {
        id: 'transfer', label: 'Send PAS', category: 'transfer', icon: '↑',
        desc: 'Native PAS token transfer to any address.',
        needsAmt: true, unit: 'PAS',
    },
    {
        id: 'mint_score', label: 'Mint VeraScore', category: 'score', icon: '◈',
        desc: 'Mint or refresh your VeraScore soulbound NFT on-chain.',
        needsAmt: false,
    },
    {
        id: 'deposit', label: 'Deposit Collateral', category: 'lending', icon: '⬇',
        desc: 'Deposit PAS as collateral into the lending pool.',
        needsAmt: true, unit: 'PAS',
    },
    {
        id: 'borrow', label: 'Borrow PAS', category: 'lending', icon: '↗',
        desc: 'Borrow PAS from the pool against your collateral.',
        needsAmt: true, unit: 'PAS',
    },
    {
        id: 'repay', label: 'Repay Debt', category: 'lending', icon: '↩',
        desc: 'Repay outstanding debt plus interest.',
        needsAmt: true, unit: 'PAS',
    },
    {
        id: 'withdraw', label: 'Withdraw Collateral', category: 'lending', icon: '⬆',
        desc: 'Withdraw available collateral from the pool.',
        needsAmt: true, unit: 'PAS',
    },
];
const CATEGORY_COLORS = {
    transfer: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
    score: 'text-polkadot-pink border-pink-500/30 bg-pink-500/10',
    lending: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
};
const POOL_ABI = [
    { name: 'deposit', type: 'function', stateMutability: 'payable', inputs: [], outputs: [] },
    { name: 'borrow', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
    { name: 'repay', type: 'function', stateMutability: 'payable', inputs: [], outputs: [] },
    { name: 'withdraw', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
];
export function FeeCalculator() {
    const { address, isConnected } = useAccount();
    const chainId = useChainId();
    const client = usePublicClient({ chainId: pasTestnet.id });
    const { data: gasPriceData, refetch: refetchGas } = useGasPrice({ chainId: pasTestnet.id });
    const { data: balData } = useBalance({ address, chainId: pasTestnet.id });
    const [selectedTx, setSelectedTx] = useState(TX_TYPES[0]);
    const [amount, setAmount] = useState('1');
    const [pasUsd, setPasUsd] = useState(DEFAULT_PAS_USD.toString());
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [lastCalc, setLastCalc] = useState(null);
    const estimate = useCallback(async () => {
        if (!client)
            return;
        setLoading(true);
        setError('');
        try {
            await refetchGas();
            const gasPrice = gasPriceData ?? 1000000000n;
            const from = address ?? ZERO_ADDR;
            const amtWei = parseEther(amount || '0');
            const pasPrice = parseFloat(pasUsd) || DEFAULT_PAS_USD;
            let gasUnits;
            switch (selectedTx.id) {
                case 'transfer':
                    gasUnits = await client.estimateGas({ account: from, to: ZERO_ADDR, value: amtWei });
                    break;
                case 'mint_score':
                    // Actual mintScore with proxy logic uses ~145k gas pa!
                    gasUnits = 145000n;
                    break;
                case 'deposit':
                    gasUnits = await client.estimateContractGas({
                        address: LENDING_POOL, abi: POOL_ABI, functionName: 'deposit', account: from, value: amtWei,
                    }).catch(() => 95000n);
                    break;
                case 'borrow':
                    gasUnits = await client.estimateContractGas({
                        address: LENDING_POOL, abi: POOL_ABI, functionName: 'borrow', account: from, args: [amtWei],
                    }).catch(() => 110000n);
                    break;
                case 'repay':
                    gasUnits = await client.estimateContractGas({
                        address: LENDING_POOL, abi: POOL_ABI, functionName: 'repay', account: from, value: amtWei,
                    }).catch(() => 85000n);
                    break;
                case 'withdraw':
                    gasUnits = await client.estimateContractGas({
                        address: LENDING_POOL, abi: POOL_ABI, functionName: 'withdraw', account: from, args: [amtWei],
                    }).catch(() => 90000n);
                    break;
                default:
                    gasUnits = 21000n;
            }
            const feeWei = gasUnits * gasPrice;
            const feePAS = Number(formatUnits(feeWei, 18));
            const feeUSD = feePAS * pasPrice;
            const amtNum = parseFloat(amount || '0');
            setResult({
                gasUnits, gasPrice, feePAS, feeUSD, feeUSDC: feeUSD,
                totalPAS: feePAS + (selectedTx.needsAmt ? amtNum : 0),
                totalUSD: feeUSD + (selectedTx.needsAmt ? amtNum * pasPrice : 0),
            });
            setLastCalc(new Date());
        }
        catch (e) {
            setError(e.message.includes('insufficient') ? 'Balance too low for estimation.' : 'Execution error on-chain.');
        }
        finally {
            setLoading(false);
        }
    }, [client, address, selectedTx, amount, pasUsd, gasPriceData, refetchGas]);
    useEffect(() => {
        if (isConnected && client)
            estimate();
    }, [selectedTx.id, isConnected, client, estimate]);
    const balance = balData ? Number(balData.value) / 1e18 : null;
    return (_jsxs("div", { className: "max-w-7xl mx-auto px-6 py-12 space-y-12", children: [_jsxs("div", { className: "space-y-2", children: [_jsxs("h1", { className: "text-3xl font-black tracking-tighter uppercase italic text-white", children: ["Fee ", _jsx("span", { className: "text-polkadot-pink text-4xl", children: "Calculator" })] }), _jsx("p", { className: "text-gray-500 text-sm font-medium uppercase tracking-widest", children: "Real-Time Gas Metrics \u00B7 Paseo Parachain Stats" })] }), _jsxs("div", { className: "grid grid-cols-1 xl:grid-cols-12 gap-8", children: [_jsxs("div", { className: "xl:col-span-4 space-y-6", children: [_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-3xl overflow-hidden shadow-2xl", children: [_jsx("div", { className: "px-6 py-4 border-b border-polkadot-border bg-black/20 text-[10px] text-gray-500 font-black uppercase tracking-widest", children: "Operation Type" }), _jsx("div", { className: "p-4 space-y-2", children: TX_TYPES.map(tx => (_jsxs("button", { onClick: () => { setSelectedTx(tx); setResult(null); }, className: `w-full text-left px-4 py-3.5 rounded-2xl flex items-center gap-4 transition-all border ${selectedTx.id === tx.id ? 'bg-polkadot-pink/10 border-polkadot-pink/30 shadow-inner' : 'border-transparent text-gray-500 hover:bg-white/5'}`, children: [_jsx("span", { className: `w-8 h-8 rounded-xl flex items-center justify-center text-lg border shrink-0 ${selectedTx.id === tx.id ? CATEGORY_COLORS[tx.category] : 'border-polkadot-border text-gray-700'}`, children: tx.icon }), _jsxs("div", { className: "flex-1", children: [_jsx("div", { className: `text-sm font-black uppercase tracking-tight ${selectedTx.id === tx.id ? 'text-white' : 'text-gray-500'}`, children: tx.label }), _jsx("div", { className: "text-[9px] font-bold text-gray-600 uppercase tracking-tighter truncate", children: tx.desc })] })] }, tx.id))) })] }), selectedTx.needsAmt && (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-3xl p-6 space-y-4 shadow-xl", children: [_jsxs("div", { className: "flex justify-between items-end", children: [_jsx("label", { className: "text-[10px] text-gray-600 font-black uppercase tracking-widest", children: "Transaction Volume" }), balance !== null && _jsxs("span", { className: "text-[9px] font-bold text-polkadot-pink uppercase", children: ["Bal: ", balance.toFixed(2), " PAS"] })] }), _jsxs("div", { className: "relative", children: [_jsx("input", { type: "number", value: amount, onChange: e => setAmount(e.target.value), className: "w-full bg-polkadot-dark border border-polkadot-border rounded-2xl px-5 py-4 text-xl font-mono text-white outline-none focus:border-polkadot-pink/40 shadow-inner" }), _jsx("div", { className: "absolute right-5 top-1/2 -translate-y-1/2 font-black text-xs text-gray-600 uppercase", children: selectedTx.unit })] })] }))] }), _jsxs("div", { className: "xl:col-span-8 space-y-6", children: [_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-3xl overflow-hidden shadow-2xl", children: [_jsxs("div", { className: "px-8 py-5 border-b border-polkadot-border flex items-center justify-between bg-black/20", children: [_jsx("div", { className: "text-[10px] text-gray-500 font-black uppercase tracking-widest", children: "On-Chain Estimate" }), _jsx("button", { onClick: estimate, disabled: loading, className: "bg-polkadot-pink text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-polkadot-pink/10 hover:scale-105 transition-all", children: loading ? 'Calculating...' : '↻ Re-Sync' })] }), _jsx("div", { className: "p-8 space-y-8", children: result ? (_jsxs("div", { className: "space-y-8 animate-in fade-in duration-500", children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [_jsxs("div", { className: "bg-polkadot-dark/60 border border-white/5 rounded-2xl p-6 space-y-1 shadow-inner", children: [_jsx("div", { className: "text-[9px] text-gray-600 font-black uppercase tracking-widest", children: "Gas Cost" }), _jsx("div", { className: "text-2xl font-black font-mono text-white tracking-tighter", children: result.feePAS.toFixed(6) }), _jsx("div", { className: "text-[10px] font-bold text-gray-700 uppercase", children: "PAS Token" })] }), _jsxs("div", { className: "bg-polkadot-dark/60 border border-white/5 rounded-2xl p-6 space-y-1 shadow-inner", children: [_jsx("div", { className: "text-[9px] text-gray-600 font-black uppercase tracking-widest", children: "USD Value" }), _jsxs("div", { className: "text-2xl font-black font-mono text-emerald-400 tracking-tighter", children: ["$", result.feeUSD.toFixed(4)] }), _jsxs("div", { className: "text-[10px] font-bold text-gray-700 uppercase", children: ["@ $", parseFloat(pasUsd).toFixed(2), "/PAS"] })] }), _jsxs("div", { className: "bg-polkadot-dark/60 border border-white/5 rounded-2xl p-6 space-y-1 shadow-inner", children: [_jsx("div", { className: "text-[9px] text-gray-600 font-black uppercase tracking-widest", children: "Gas Units" }), _jsx("div", { className: "text-2xl font-black font-mono text-blue-400 tracking-tighter", children: result.gasUnits.toLocaleString() }), _jsx("div", { className: "text-[10px] font-bold text-gray-700 uppercase", children: "Computational Work" })] })] }), _jsxs("div", { className: "bg-black/20 rounded-2xl p-4 border border-white/5 font-mono text-[10px] text-gray-600 flex items-center gap-2", children: [_jsx("span", { className: "text-emerald-500 font-bold uppercase tracking-tighter", children: "Formula:" }), _jsxs("span", { children: [result.gasUnits.toLocaleString(), " units \u00D7 ", (Number(result.gasPrice) / 1e9).toFixed(3), " Gwei = ", result.feePAS.toFixed(6), " PAS"] })] })] })) : (_jsxs("div", { className: "py-20 text-center space-y-4 opacity-40", children: [_jsx("div", { className: "text-6xl", children: "\u26FD" }), _jsx("div", { className: "text-sm font-black uppercase tracking-widest", children: "Awaiting Parameter Input" })] })) })] }), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-3xl overflow-hidden shadow-xl", children: [_jsx("div", { className: "px-8 py-4 border-b border-polkadot-border bg-black/20 text-[10px] text-gray-500 font-black uppercase tracking-widest", children: "Network Benchmarks" }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-left", children: [_jsx("thead", { className: "bg-black/10 border-b border-white/5", children: _jsxs("tr", { children: [_jsx("th", { className: "px-8 py-4 text-[9px] font-black text-gray-700 uppercase tracking-widest", children: "Operation" }), _jsx("th", { className: "px-4 py-4 text-[9px] font-black text-gray-700 uppercase tracking-widest text-right", children: "Gas Units" }), _jsx("th", { className: "px-8 py-4 text-[9px] font-black text-gray-700 uppercase tracking-widest text-right", children: "Cost (PAS)" })] }) }), _jsx("tbody", { className: "divide-y divide-white/5", children: TX_TYPES.map(row => (_jsxs("tr", { className: "hover:bg-white/[0.02] transition-colors", children: [_jsx("td", { className: "px-8 py-4 text-xs font-bold text-gray-400 uppercase tracking-tighter", children: row.label }), _jsxs("td", { className: "px-4 py-4 text-xs font-mono text-gray-500 text-right", children: ["~", row.id === 'mint_score' ? '145,000' : '21,000+'] }), _jsx("td", { className: "px-8 py-4 text-xs font-mono text-emerald-500/80 text-right", children: "LIVE" })] }, row.id))) })] }) })] })] })] })] }));
}
