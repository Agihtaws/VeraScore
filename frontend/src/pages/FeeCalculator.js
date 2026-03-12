import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount, usePublicClient, useBalance, useChainId } from 'wagmi';
import { parseEther, formatUnits } from 'viem';
import { pasTestnet } from '../utils/wagmi.js';
const LENDING_POOL = (import.meta.env.VITE_LENDING_POOL ?? '');
const ZERO_ADDR = '0x0000000000000000000000000000000000000001';
const DEFAULT_PAS_USD = 6.5;
const TX_TYPES = [
    { id: 'transfer', label: 'Send PAS', category: 'transfer', icon: '↑', needsAmt: true, unit: 'PAS', fallbackGas: 21000n,
        desc: 'Native PAS token transfer.' },
    { id: 'mint_score', label: 'Mint VeraScore', category: 'score', icon: '◈', needsAmt: false, fallbackGas: 145000n,
        desc: 'Mint or refresh VeraScore NFT.' },
    { id: 'deposit', label: 'Deposit Collateral', category: 'lending', icon: '⬇', needsAmt: true, unit: 'PAS', fallbackGas: 95000n,
        desc: 'Deposit PAS as collateral.' },
    { id: 'borrow', label: 'Borrow PAS', category: 'lending', icon: '↗', needsAmt: true, unit: 'PAS', fallbackGas: 110000n,
        desc: 'Borrow PAS from pool.' },
    { id: 'repay', label: 'Repay Debt', category: 'lending', icon: '↩', needsAmt: true, unit: 'PAS', fallbackGas: 85000n,
        desc: 'Repay outstanding debt.' },
    { id: 'withdraw', label: 'Withdraw Collateral', category: 'lending', icon: '⬆', needsAmt: true, unit: 'PAS', fallbackGas: 90000n,
        desc: 'Withdraw available collateral.' },
];
const CAT_COLOR = {
    transfer: 'text-blue-400   border-blue-500/30   bg-blue-500/10',
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
    const { data: balData } = useBalance({ address, chainId: pasTestnet.id });
    const [selectedTx, setSelectedTx] = useState(TX_TYPES[0]);
    const [amount, setAmount] = useState('1');
    const [pasUsd, setPasUsd] = useState(DEFAULT_PAS_USD.toString());
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [lastCalc, setLastCalc] = useState(null);
    const txRef = useRef(selectedTx);
    const amtRef = useRef(amount);
    const pasRef = useRef(pasUsd);
    useEffect(() => { txRef.current = selectedTx; }, [selectedTx]);
    useEffect(() => { amtRef.current = amount; }, [amount]);
    useEffect(() => { pasRef.current = pasUsd; }, [pasUsd]);
    const estimate = useCallback(async () => {
        if (!client)
            return;
        setLoading(true);
        setError('');
        const tx = txRef.current;
        const amtStr = amtRef.current;
        const pasPrice = parseFloat(pasRef.current) || DEFAULT_PAS_USD;
        const from = address ?? ZERO_ADDR;
        const amtWei = parseEther(amtStr || '0');
        try {
            let gasPrice = 1000000000n;
            try {
                gasPrice = await client.getGasPrice();
            }
            catch { /* fallback */ }
            let gasUnits;
            switch (tx.id) {
                case 'transfer':
                    gasUnits = await client.estimateGas({ account: from, to: ZERO_ADDR, value: amtWei }).catch(() => tx.fallbackGas);
                    break;
                case 'mint_score':
                    gasUnits = tx.fallbackGas;
                    break;
                case 'deposit':
                    gasUnits = LENDING_POOL
                        ? await client.estimateContractGas({ address: LENDING_POOL, abi: POOL_ABI, functionName: 'deposit', account: from, value: amtWei }).catch(() => tx.fallbackGas)
                        : tx.fallbackGas;
                    break;
                case 'borrow':
                    gasUnits = LENDING_POOL
                        ? await client.estimateContractGas({ address: LENDING_POOL, abi: POOL_ABI, functionName: 'borrow', account: from, args: [amtWei] }).catch(() => tx.fallbackGas)
                        : tx.fallbackGas;
                    break;
                case 'repay':
                    gasUnits = LENDING_POOL
                        ? await client.estimateContractGas({ address: LENDING_POOL, abi: POOL_ABI, functionName: 'repay', account: from, value: amtWei }).catch(() => tx.fallbackGas)
                        : tx.fallbackGas;
                    break;
                case 'withdraw':
                    gasUnits = LENDING_POOL
                        ? await client.estimateContractGas({ address: LENDING_POOL, abi: POOL_ABI, functionName: 'withdraw', account: from, args: [amtWei] }).catch(() => tx.fallbackGas)
                        : tx.fallbackGas;
                    break;
                default:
                    gasUnits = 21000n;
            }
            const feeWei = gasUnits * gasPrice;
            const feePAS = Number(formatUnits(feeWei, 18));
            const feeUSD = feePAS * pasPrice;
            const amtNum = parseFloat(amtStr || '0');
            setResult({ gasUnits, gasPrice, feePAS, feeUSD,
                totalPAS: feePAS + (tx.needsAmt ? amtNum : 0),
                totalUSD: feeUSD + (tx.needsAmt ? amtNum * pasPrice : 0),
            });
            setLastCalc(new Date());
        }
        catch (e) {
            const msg = e?.message ?? '';
            setError(msg.includes('insufficient') ? 'Balance too low for estimation.' : 'Estimation failed — showing fallback values.');
            const gasPrice = 1000000000n;
            const gasUnits = tx.fallbackGas;
            const feePAS = Number(formatUnits(gasUnits * gasPrice, 18));
            const feeUSD = feePAS * (parseFloat(pasRef.current) || DEFAULT_PAS_USD);
            const amtNum = parseFloat(amtStr || '0');
            setResult({ gasUnits, gasPrice, feePAS, feeUSD,
                totalPAS: feePAS + (tx.needsAmt ? amtNum : 0),
                totalUSD: feeUSD + (tx.needsAmt ? amtNum * feeUSD : 0),
            });
        }
        finally {
            setLoading(false);
        }
    }, [client, address]);
    useEffect(() => {
        if (isConnected && client)
            estimate();
    }, [selectedTx.id, isConnected]); // eslint-disable-line react-hooks/exhaustive-deps
    const balance = balData ? Number(balData.value) / 1e18 : null;
    return (_jsxs("div", { className: "max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-xl font-black tracking-tight text-white", children: ["Fee ", _jsx("span", { className: "text-polkadot-pink", children: "Calculator" })] }), _jsx("p", { className: "text-[10px] text-gray-600 mt-0.5 font-medium", children: "Real-time gas estimates \u00B7 Paseo Hub" })] }), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsx("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20", children: _jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-gray-500", children: "Operation Type" }) }), _jsx("div", { className: "p-2 grid grid-cols-2 gap-1.5", children: TX_TYPES.map(tx => (_jsxs("button", { onClick: () => { setSelectedTx(tx); setResult(null); setError(''); }, className: `text-left px-3 py-2.5 rounded-xl flex items-center gap-2.5 transition-all border ${selectedTx.id === tx.id
                                ? 'bg-polkadot-pink/10 border-polkadot-pink/30'
                                : 'border-transparent text-gray-600 hover:bg-white/5'}`, children: [_jsx("span", { className: `w-7 h-7 rounded-lg flex items-center justify-center text-sm border shrink-0 ${selectedTx.id === tx.id ? CAT_COLOR[tx.category] : 'border-polkadot-border text-gray-700'}`, children: tx.icon }), _jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: `text-[10px] font-black uppercase tracking-tight truncate ${selectedTx.id === tx.id ? 'text-white' : 'text-gray-500'}`, children: tx.label }), _jsx("div", { className: "text-[8px] text-gray-700 truncate", children: tx.desc })] })] }, tx.id))) })] }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: [selectedTx.needsAmt && (_jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("div", { className: "text-[8px] font-bold uppercase tracking-widest text-gray-700", children: "Amount" }), balance !== null && (_jsxs("span", { className: "text-[8px] font-bold text-polkadot-pink", children: ["Bal: ", balance.toFixed(4), " PAS"] }))] }), _jsxs("div", { className: "relative", children: [_jsx("input", { type: "number", value: amount, onChange: e => setAmount(e.target.value), className: "w-full bg-polkadot-card border border-polkadot-border rounded-xl px-4 py-2.5 text-sm font-mono text-white outline-none focus:border-polkadot-pink/40" }), _jsx("span", { className: "absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-gray-700 uppercase", children: selectedTx.unit })] })] })), _jsxs("div", { className: "space-y-1.5", children: [_jsx("div", { className: "text-[8px] font-bold uppercase tracking-widest text-gray-700", children: "PAS Price (USD)" }), _jsxs("div", { className: "relative", children: [_jsx("span", { className: "absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 font-bold text-sm", children: "$" }), _jsx("input", { type: "number", value: pasUsd, step: "0.1", min: "0", onChange: e => setPasUsd(e.target.value), className: "w-full bg-polkadot-card border border-polkadot-border rounded-xl pl-7 pr-4 py-2.5 text-sm font-mono text-white outline-none focus:border-polkadot-pink/40" })] })] })] }), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden shadow-xl", children: [_jsxs("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20 flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-gray-500", children: "On-Chain Estimate" }), lastCalc && _jsx("span", { className: "text-[8px] text-gray-700 font-mono ml-2", children: lastCalc.toLocaleTimeString() })] }), _jsx("button", { onClick: estimate, disabled: loading, className: "bg-polkadot-pink hover:bg-pink-600 text-white px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-40", children: loading ? 'Calculating…' : '↻ Re-Sync' })] }), _jsxs("div", { className: "p-4 space-y-4", children: [error && (_jsxs("div", { className: "bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-3 py-2 text-[9px] font-semibold text-yellow-400", children: ["\u26A0 ", error] })), result ? (_jsxs("div", { className: "space-y-3", children: [_jsx("div", { className: "grid grid-cols-3 gap-px bg-polkadot-border rounded-xl overflow-hidden", children: [
                                            { label: 'Gas Cost', value: result.feePAS.toFixed(6), sub: 'PAS', color: 'text-white' },
                                            { label: 'USD Value', value: `$${result.feeUSD.toFixed(4)}`, sub: `@ $${parseFloat(pasUsd).toFixed(2)}/PAS`, color: 'text-emerald-400' },
                                            { label: 'Gas Units', value: result.gasUnits.toLocaleString(), sub: 'Compute', color: 'text-blue-400' },
                                        ].map(({ label, value, sub, color }) => (_jsxs("div", { className: "bg-polkadot-card px-3 py-3 space-y-0.5", children: [_jsx("div", { className: "text-[8px] font-bold uppercase tracking-widest text-gray-700", children: label }), _jsx("div", { className: `text-sm font-black font-mono ${color}`, children: value }), _jsx("div", { className: "text-[8px] text-gray-700 uppercase", children: sub })] }, label))) }), _jsxs("div", { className: "bg-black/20 border border-white/5 rounded-xl px-3 py-2 font-mono text-[9px] text-gray-600", children: [_jsx("span", { className: "text-emerald-500 font-bold", children: "Formula: " }), result.gasUnits.toLocaleString(), " \u00D7 ", (Number(result.gasPrice) / 1e9).toFixed(3), " Gwei = ", result.feePAS.toFixed(8), " PAS"] }), selectedTx.needsAmt && parseFloat(amount) > 0 && (_jsxs("div", { className: "grid grid-cols-2 gap-px bg-polkadot-border rounded-xl overflow-hidden", children: [_jsxs("div", { className: "bg-polkadot-card px-3 py-3", children: [_jsx("div", { className: "text-[8px] font-bold uppercase tracking-widest text-gray-700 mb-0.5", children: "Total Required" }), _jsxs("div", { className: "text-sm font-black font-mono text-white", children: [result.totalPAS.toFixed(6), " PAS"] })] }), _jsxs("div", { className: "bg-polkadot-card px-3 py-3", children: [_jsx("div", { className: "text-[8px] font-bold uppercase tracking-widest text-gray-700 mb-0.5", children: "Total USD" }), _jsxs("div", { className: "text-sm font-black font-mono text-emerald-400", children: ["$", result.totalUSD.toFixed(4)] })] })] }))] })) : (_jsxs("div", { className: "py-10 text-center opacity-40 space-y-2", children: [_jsx("div", { className: "text-4xl", children: "\u26FD" }), _jsx("div", { className: "text-xs font-black uppercase tracking-widest", children: loading ? 'Calculating gas…' : 'Select operation and click Re-Sync' })] }))] })] }), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsx("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20", children: _jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-gray-500", children: "Network Benchmarks" }) }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-left", children: [_jsx("thead", { className: "bg-black/10 border-b border-white/5", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-2.5 text-[8px] font-black text-gray-700 uppercase tracking-widest", children: "Operation" }), _jsx("th", { className: "px-3 py-2.5 text-[8px] font-black text-gray-700 uppercase tracking-widest text-right", children: "Gas Units" }), _jsx("th", { className: "px-4 py-2.5 text-[8px] font-black text-gray-700 uppercase tracking-widest text-right", children: "~PAS Cost" })] }) }), _jsx("tbody", { className: "divide-y divide-white/5", children: TX_TYPES.map(row => {
                                        const gasUnits = (result && selectedTx.id === row.id) ? result.gasUnits : row.fallbackGas;
                                        const gasPrice = result ? result.gasPrice : 1000000000n;
                                        const cost = Number(gasUnits * gasPrice) / 1e18;
                                        return (_jsxs("tr", { onClick: () => { setSelectedTx(row); setResult(null); setError(''); }, className: `cursor-pointer transition-colors ${selectedTx.id === row.id ? 'bg-polkadot-pink/5' : 'hover:bg-white/[0.02]'}`, children: [_jsxs("td", { className: "px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase", children: [selectedTx.id === row.id && _jsx("span", { className: "text-polkadot-pink mr-1", children: "\u25B6" }), row.label] }), _jsxs("td", { className: "px-3 py-2.5 text-[10px] font-mono text-gray-600 text-right", children: ["~", gasUnits.toLocaleString()] }), _jsx("td", { className: "px-4 py-2.5 text-[10px] font-mono text-right", children: _jsx("span", { className: selectedTx.id === row.id ? 'text-emerald-400' : 'text-emerald-600/50', children: cost.toFixed(6) }) })] }, row.id));
                                    }) })] }) })] })] }));
}
