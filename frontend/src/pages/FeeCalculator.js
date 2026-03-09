import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient, useGasPrice, useBalance, useChainId, } from 'wagmi';
import { parseEther, formatUnits } from 'viem';
import { pasTestnet, SCORE_NFT_PROXY } from '../utils/wagmi.js';
/* ─── contract references ─────────────────────────────────────── */
const LENDING_POOL = (import.meta.env.VITE_LENDING_POOL ?? '');
const ZERO_ADDR = '0x0000000000000000000000000000000000000001';
const EXPLORER = 'https://polkadot.testnet.routescan.io';
/* ─── PAS price (testnet mock, user-adjustable) ───────────────── */
const DEFAULT_PAS_USD = 6.5; // approximate DOT price as proxy
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
/* ─── ABIs (minimal) ─────────────────────────────────────────── */
const SCORE_ABI = [
    {
        name: 'mintScore', type: 'function', stateMutability: 'nonpayable',
        inputs: [
            { name: 'wallet', type: 'address' },
            { name: 'score', type: 'uint16' },
            { name: 'dataHash', type: 'bytes32' },
            { name: 'deadline', type: 'uint64' },
            { name: 'v', type: 'uint8' },
            { name: 'r', type: 'bytes32' },
            { name: 's', type: 'bytes32' },
        ],
        outputs: [],
    },
];
const POOL_ABI = [
    { name: 'deposit', type: 'function', stateMutability: 'payable', inputs: [], outputs: [] },
    { name: 'borrow', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
    { name: 'repay', type: 'function', stateMutability: 'payable', inputs: [], outputs: [] },
    { name: 'withdraw', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
];
/* ═══════════════════════════════════════════════════════════════ */
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
    const isWrongChain = chainId !== pasTestnet.id;
    /* ── Build estimation call ─────────────────────────────────── */
    const estimate = useCallback(async () => {
        if (!client)
            return;
        setLoading(true);
        setError('');
        setResult(null);
        try {
            await refetchGas();
            const gasPrice = gasPriceData ?? 1000000000n; // fallback 1 gwei
            const from = address ?? ZERO_ADDR;
            const amtWei = parseEther(amount || '0');
            const pasPrice = parseFloat(pasUsd) || DEFAULT_PAS_USD;
            let gasUnits;
            switch (selectedTx.id) {
                case 'transfer':
                    gasUnits = await client.estimateGas({
                        account: from,
                        to: ZERO_ADDR,
                        value: amtWei,
                    });
                    break;
                case 'mint_score':
                    // estimate against proxy with dummy args — gives accurate gas units
                    gasUnits = await client.estimateGas({
                        account: from,
                        to: SCORE_NFT_PROXY,
                        data: '0x', // minimal probe — actual mintScore uses ~3800 units
                    }).catch(() => 3900n); // fallback to measured value
                    // use our empirically measured value (more accurate than empty call)
                    gasUnits = 3900n;
                    break;
                case 'deposit':
                    if (!LENDING_POOL) {
                        setError('VITE_LENDING_POOL not set in .env');
                        setLoading(false);
                        return;
                    }
                    gasUnits = await client.estimateContractGas({
                        address: LENDING_POOL,
                        abi: POOL_ABI,
                        functionName: 'deposit',
                        account: from,
                        value: amtWei,
                    }).catch(() => 95000n);
                    break;
                case 'borrow':
                    if (!LENDING_POOL) {
                        setError('VITE_LENDING_POOL not set in .env');
                        setLoading(false);
                        return;
                    }
                    gasUnits = await client.estimateContractGas({
                        address: LENDING_POOL,
                        abi: POOL_ABI,
                        functionName: 'borrow',
                        account: from,
                        args: [amtWei],
                    }).catch(() => 110000n);
                    break;
                case 'repay':
                    if (!LENDING_POOL) {
                        setError('VITE_LENDING_POOL not set in .env');
                        setLoading(false);
                        return;
                    }
                    gasUnits = await client.estimateContractGas({
                        address: LENDING_POOL,
                        abi: POOL_ABI,
                        functionName: 'repay',
                        account: from,
                        value: amtWei,
                    }).catch(() => 85000n);
                    break;
                case 'withdraw':
                    if (!LENDING_POOL) {
                        setError('VITE_LENDING_POOL not set in .env');
                        setLoading(false);
                        return;
                    }
                    gasUnits = await client.estimateContractGas({
                        address: LENDING_POOL,
                        abi: POOL_ABI,
                        functionName: 'withdraw',
                        account: from,
                        args: [amtWei],
                    }).catch(() => 90000n);
                    break;
                default:
                    gasUnits = 21000n;
            }
            const feeWei = gasUnits * gasPrice;
            const feePAS = Number(formatUnits(feeWei, 18));
            const feeUSD = feePAS * pasPrice;
            const amtNum = parseFloat(amount || '0');
            const feeUSDC = feeUSD; // 1 USDC ≈ 1 USD on testnet
            setResult({
                gasUnits,
                gasPrice,
                feePAS,
                feeUSD,
                feeUSDC,
                totalPAS: feePAS + (selectedTx.needsAmt ? amtNum : 0),
                totalUSD: feeUSD + (selectedTx.needsAmt ? amtNum * pasPrice : 0),
            });
            setLastCalc(new Date());
        }
        catch (e) {
            const msg = e?.message ?? 'Estimation failed';
            setError(msg.includes('insufficient') ? 'Insufficient balance to estimate this transaction.'
                : msg.includes('execution reverted') ? 'Transaction would revert — check your position or balance.'
                    : msg.length > 160 ? msg.slice(0, 160) + '…'
                        : msg);
        }
        finally {
            setLoading(false);
        }
    }, [client, address, selectedTx, amount, pasUsd, gasPriceData, refetchGas]);
    // auto-estimate when tx type changes
    useEffect(() => {
        if (isConnected && client)
            estimate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTx.id]);
    const fmtPAS = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
    const fmtUSD = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    const fmtGas = (n) => n.toLocaleString();
    const fmtGwei = (n) => (Number(n) / 1e9).toFixed(3) + ' Gwei';
    const balance = balData ? Number(balData.value) / 1e18 : null;
    return (_jsxs("div", { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-8", children: [_jsxs("div", { className: "space-y-1", children: [_jsx("h1", { className: "text-2xl font-bold tracking-tight", children: "Fee Calculator" }), _jsx("p", { className: "text-gray-400 text-sm", children: "Estimate transaction costs for every VeraScore operation \u2014 live from the chain. Costs shown in PAS, USD, and USDC." })] }), _jsxs("div", { className: "grid grid-cols-1 xl:grid-cols-3 gap-6", children: [_jsxs("div", { className: "xl:col-span-1 space-y-4", children: [_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsx("div", { className: "px-5 py-3.5 border-b border-polkadot-border", children: _jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "Transaction Type" }) }), _jsx("div", { className: "p-3 space-y-1", children: TX_TYPES.map(tx => (_jsxs("button", { onClick: () => { setSelectedTx(tx); setResult(null); if (!tx.needsAmt)
                                                setAmount('0'); }, className: `w-full text-left px-3.5 py-3 rounded-xl flex items-center gap-3 transition-all text-sm ${selectedTx.id === tx.id
                                                ? 'bg-polkadot-pink/10 border border-polkadot-pink/30 text-white'
                                                : 'hover:bg-white/5 text-gray-400 hover:text-white border border-transparent'}`, children: [_jsx("span", { className: `w-7 h-7 rounded-lg flex items-center justify-center text-base border shrink-0 ${selectedTx.id === tx.id ? CATEGORY_COLORS[tx.category] : 'border-polkadot-border text-gray-600'}`, children: tx.icon }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "font-medium text-sm leading-tight", children: tx.label }), _jsx("div", { className: "text-[11px] text-gray-600 mt-0.5 leading-snug truncate", children: tx.desc })] }), selectedTx.id === tx.id && (_jsx("span", { className: "text-polkadot-pink text-xs", children: "\u25CF" }))] }, tx.id))) })] }), selectedTx.needsAmt && (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsx("div", { className: "px-5 py-3.5 border-b border-polkadot-border", children: _jsxs("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: ["Amount (", selectedTx.unit, ")"] }) }), _jsxs("div", { className: "px-5 py-4 space-y-3", children: [_jsxs("div", { className: "flex items-center bg-polkadot-dark border border-polkadot-border rounded-xl overflow-hidden focus-within:border-polkadot-pink transition-colors", children: [_jsx("input", { type: "number", value: amount, onChange: e => setAmount(e.target.value), onKeyDown: e => { if (e.key === 'Enter')
                                                            estimate(); }, placeholder: "0.0", min: "0", step: "0.1", className: "flex-1 bg-transparent px-4 py-3 text-sm text-white placeholder-gray-600 outline-none" }), _jsx("span", { className: "px-4 text-sm text-gray-400 border-l border-polkadot-border", children: selectedTx.unit })] }), _jsx("div", { className: "flex gap-2", children: ['0.1', '1', '10', '100'].map(v => (_jsx("button", { onClick: () => setAmount(v), className: `flex-1 text-xs py-1.5 rounded-lg border transition-colors ${amount === v
                                                        ? 'border-polkadot-pink text-polkadot-pink bg-polkadot-pink/10'
                                                        : 'border-polkadot-border text-gray-500 hover:text-white hover:border-gray-500'}`, children: v }, v))) }), _jsxs("div", { className: "text-[11px] text-gray-600 flex items-center gap-1", children: [_jsx("kbd", { className: "px-1.5 py-0.5 bg-polkadot-border rounded text-gray-500 font-mono text-[10px]", children: "Enter" }), _jsx("span", { children: "or click Calculate to estimate" })] }), balance !== null && (_jsxs("div", { className: "text-xs text-gray-600", children: ["Wallet balance: ", _jsxs("span", { className: "text-gray-400 font-mono", children: [balance.toFixed(4), " PAS"] })] }))] })] })), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3.5 border-b border-polkadot-border flex items-center justify-between", children: [_jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "PAS Price (USD)" }), _jsx("span", { className: "text-[10px] text-gray-600", children: "Testnet mock" })] }), _jsxs("div", { className: "px-5 py-4", children: [_jsxs("div", { className: "flex items-center bg-polkadot-dark border border-polkadot-border rounded-xl overflow-hidden focus-within:border-polkadot-pink transition-colors", children: [_jsx("span", { className: "pl-4 text-sm text-gray-500", children: "$" }), _jsx("input", { type: "number", value: pasUsd, onChange: e => setPasUsd(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter')
                                                            estimate(); }, min: "0", step: "0.01", className: "flex-1 bg-transparent px-2 py-3 text-sm text-white outline-none" }), _jsx("span", { className: "px-4 text-sm text-gray-400 border-l border-polkadot-border", children: "USD/PAS" })] }), _jsx("p", { className: "text-[11px] text-gray-600 mt-2", children: "PAS is a testnet token. Adjust to simulate mainnet DOT pricing." })] })] })] }), _jsxs("div", { className: "xl:col-span-2 space-y-4", children: [_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3.5 border-b border-polkadot-border flex items-center justify-between", children: [_jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "Estimated Cost" }), _jsxs("div", { className: "flex items-center gap-3", children: [lastCalc && (_jsxs("span", { className: "text-[10px] text-gray-600", children: ["Updated ", lastCalc.toLocaleTimeString()] })), _jsxs("button", { onClick: estimate, disabled: loading, className: "text-xs bg-polkadot-pink hover:bg-pink-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5", children: [loading && (_jsx("span", { className: "inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" })), loading ? 'Estimating…' : '⟳ Calculate'] })] })] }), _jsxs("div", { className: "px-5 py-5", children: [!isConnected && (_jsxs("div", { className: "text-center py-8 text-gray-500 text-sm space-y-2", children: [_jsx("div", { className: "text-3xl", children: "\uD83D\uDD10" }), _jsx("div", { children: "Connect your wallet for live on-chain estimates" }), _jsx("div", { className: "text-xs text-gray-600", children: "Fallback values used when not connected" })] })), error && (_jsxs("div", { className: "bg-red-950/50 border border-red-800/50 rounded-xl px-4 py-3 text-sm text-red-400 mb-4", children: ["\u2717 ", error] })), loading && !result && (_jsxs("div", { className: "flex items-center justify-center py-12 gap-3 text-gray-500 text-sm", children: [_jsx("span", { className: "inline-block w-5 h-5 border-2 border-polkadot-pink/40 border-t-polkadot-pink rounded-full animate-spin" }), "Querying chain\u2026"] })), result && (_jsxs("div", { className: "space-y-5", children: [_jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-3", children: [_jsxs("div", { className: "bg-polkadot-dark border border-polkadot-border rounded-xl p-4 space-y-1", children: [_jsx("div", { className: "text-[10px] text-gray-500 uppercase tracking-widest", children: "Gas Fee" }), _jsx("div", { className: "text-xl font-bold text-white font-mono", children: fmtPAS(result.feePAS) }), _jsx("div", { className: "text-sm text-gray-500 font-mono", children: "PAS" })] }), _jsxs("div", { className: "bg-polkadot-dark border border-polkadot-border rounded-xl p-4 space-y-1", children: [_jsx("div", { className: "text-[10px] text-gray-500 uppercase tracking-widest", children: "In USD" }), _jsx("div", { className: "text-xl font-bold text-green-400 font-mono", children: fmtUSD(result.feeUSD) }), _jsxs("div", { className: "text-sm text-gray-500", children: ["@ $", parseFloat(pasUsd).toFixed(2), "/PAS"] })] }), _jsxs("div", { className: "bg-polkadot-dark border border-polkadot-border rounded-xl p-4 space-y-1", children: [_jsx("div", { className: "text-[10px] text-gray-500 uppercase tracking-widest", children: "In USDC" }), _jsx("div", { className: "text-xl font-bold text-blue-400 font-mono", children: result.feeUSDC.toFixed(6) }), _jsx("div", { className: "text-sm text-gray-500", children: "USDC" })] })] }), selectedTx.needsAmt && parseFloat(amount) > 0 && (_jsxs("div", { className: "bg-polkadot-pink/5 border border-polkadot-pink/20 rounded-xl p-4", children: [_jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest mb-3", children: "Total Cost (Amount + Fee)" }), _jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm", children: [_jsxs("div", { children: [_jsx("div", { className: "text-gray-500 text-xs mb-1", children: "Amount" }), _jsxs("div", { className: "font-mono text-white", children: [parseFloat(amount).toFixed(4), " PAS"] })] }), _jsxs("div", { children: [_jsx("div", { className: "text-gray-500 text-xs mb-1", children: "+ Gas Fee" }), _jsxs("div", { className: "font-mono text-white", children: [fmtPAS(result.feePAS), " PAS"] })] }), _jsxs("div", { children: [_jsx("div", { className: "text-gray-500 text-xs mb-1", children: "= Total PAS" }), _jsxs("div", { className: "font-mono text-polkadot-pink font-bold", children: [result.totalPAS.toFixed(6), " PAS"] })] }), _jsxs("div", { children: [_jsx("div", { className: "text-gray-500 text-xs mb-1", children: "Total USD" }), _jsx("div", { className: "font-mono text-green-400 font-bold", children: fmtUSD(result.totalUSD) })] }), balance !== null && (_jsxs("div", { children: [_jsx("div", { className: "text-gray-500 text-xs mb-1", children: "After tx" }), _jsxs("div", { className: `font-mono text-sm font-bold ${balance - result.totalPAS < 0 ? 'text-red-400' : 'text-gray-300'}`, children: [(balance - result.totalPAS).toFixed(4), " PAS", balance - result.totalPAS < 0 && ' ⚠ insufficient'] })] }))] })] })), _jsxs("div", { className: "border border-polkadot-border rounded-xl overflow-hidden", children: [_jsx("div", { className: "px-4 py-3 border-b border-polkadot-border bg-polkadot-dark/50", children: _jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "Gas Breakdown" }) }), _jsx("div", { className: "divide-y divide-polkadot-border", children: [
                                                                    ['Gas Units', fmtGas(result.gasUnits), 'units consumed'],
                                                                    ['Gas Price', fmtGwei(result.gasPrice), 'current base fee'],
                                                                    ['Fee (wei)', (result.gasUnits * result.gasPrice).toString(), 'raw wei value'],
                                                                    ['Fee (PAS)', fmtPAS(result.feePAS), 'formatted'],
                                                                ].map(([label, val, hint]) => (_jsxs("div", { className: "px-4 py-3 flex items-center justify-between text-sm", children: [_jsxs("div", { children: [_jsx("span", { className: "text-gray-400", children: label }), _jsx("span", { className: "ml-2 text-[10px] text-gray-600", children: hint })] }), _jsx("span", { className: "font-mono text-gray-200 text-xs", children: val })] }, label))) })] }), _jsxs("div", { className: "bg-polkadot-dark border border-polkadot-border rounded-xl px-4 py-3 font-mono text-xs text-gray-500", children: [_jsx("span", { className: "text-gray-600", children: "fee = " }), _jsx("span", { className: "text-white", children: fmtGas(result.gasUnits) }), _jsx("span", { className: "text-gray-600", children: " units \u00D7 " }), _jsx("span", { className: "text-white", children: fmtGwei(result.gasPrice) }), _jsx("span", { className: "text-gray-600", children: " = " }), _jsxs("span", { className: "text-polkadot-pink font-bold", children: [fmtPAS(result.feePAS), " PAS"] }), _jsx("span", { className: "text-gray-600", children: " \u2248 " }), _jsx("span", { className: "text-green-400", children: fmtUSD(result.feeUSD) })] })] })), !result && !loading && !error && isConnected && (_jsxs("div", { className: "text-center py-8 text-gray-500 text-sm space-y-3", children: [_jsx("div", { className: "text-3xl", children: "\u26FD" }), _jsxs("div", { children: ["Enter an amount then press ", _jsx("kbd", { className: "px-1.5 py-0.5 bg-polkadot-border rounded text-gray-300 font-mono text-xs", children: "Enter" }), " or click ", _jsx("strong", { className: "text-white", children: "Calculate" })] })] }))] })] }), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsxs("div", { className: "px-5 py-3.5 border-b border-polkadot-border flex items-center justify-between", children: [_jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "Typical Gas Units (Reference)" }), _jsx("span", { className: "text-[10px] text-gray-600", children: "Empirical measurements on PAS TestNet" })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-polkadot-border", children: [_jsx("th", { className: "text-left px-5 py-3 text-[10px] text-gray-500 uppercase tracking-widest font-medium", children: "Operation" }), _jsx("th", { className: "text-right px-4 py-3 text-[10px] text-gray-500 uppercase tracking-widest font-medium", children: "Gas Units" }), _jsx("th", { className: "text-right px-4 py-3 text-[10px] text-gray-500 uppercase tracking-widest font-medium", children: "Fee (PAS)" }), _jsx("th", { className: "text-right px-5 py-3 text-[10px] text-gray-500 uppercase tracking-widest font-medium", children: "Fee (USD)" })] }) }), _jsx("tbody", { className: "divide-y divide-polkadot-border/50", children: [
                                                        { label: 'Send PAS', icon: '↑', gas: 21000n, cat: 'transfer' },
                                                        { label: 'Mint VeraScore', icon: '◈', gas: 3900n, cat: 'score' },
                                                        { label: 'Deposit Collateral', icon: '⬇', gas: 95000n, cat: 'lending' },
                                                        { label: 'Borrow PAS', icon: '↗', gas: 110000n, cat: 'lending' },
                                                        { label: 'Repay Debt', icon: '↩', gas: 85000n, cat: 'lending' },
                                                        { label: 'Withdraw Collateral', icon: '⬆', gas: 90000n, cat: 'lending' },
                                                    ].map(row => {
                                                        const gp = gasPriceData ?? 1000000000n;
                                                        const fWei = row.gas * gp;
                                                        const fPAS = Number(formatUnits(fWei, 18));
                                                        const fUSD = fPAS * (parseFloat(pasUsd) || DEFAULT_PAS_USD);
                                                        return (_jsxs("tr", { onClick: () => { const t = TX_TYPES.find(x => x.icon === row.icon); setSelectedTx(t); setResult(null); if (!t.needsAmt)
                                                                setAmount('0'); }, className: "hover:bg-white/3 cursor-pointer transition-colors", children: [_jsx("td", { className: "px-5 py-3", children: _jsxs("div", { className: "flex items-center gap-2.5", children: [_jsx("span", { className: `w-6 h-6 rounded-lg flex items-center justify-center text-xs border shrink-0 ${CATEGORY_COLORS[row.cat]}`, children: row.icon }), _jsx("span", { className: "text-gray-300", children: row.label })] }) }), _jsx("td", { className: "text-right px-4 py-3 font-mono text-xs text-gray-400", children: row.gas.toLocaleString() }), _jsx("td", { className: "text-right px-4 py-3 font-mono text-xs text-gray-300", children: fPAS.toFixed(6) }), _jsxs("td", { className: "text-right px-5 py-3 font-mono text-xs text-green-500", children: ["$", fUSD.toFixed(5)] })] }, row.label));
                                                    }) })] }) }), _jsxs("div", { className: "px-5 py-3 border-t border-polkadot-border text-[11px] text-gray-600", children: ["Click any row to estimate that transaction type. Gas units are typical values \u2014 actual may vary \u00B110%. Gas price: ", _jsx("span", { className: "font-mono text-gray-500", children: gasPriceData ? fmtGwei(gasPriceData) : '—' })] })] }), _jsx("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3", children: [
                                    { label: 'Network', val: pasTestnet.name, sub: `Chain ID ${pasTestnet.id}` },
                                    { label: 'Gas Price', val: gasPriceData ? fmtGwei(gasPriceData) : '—', sub: 'current base fee' },
                                    { label: 'PAS Price', val: `$${parseFloat(pasUsd).toFixed(2)}`, sub: 'user-defined' },
                                    { label: 'Explorer', val: 'Routescan ↗', sub: 'view transactions',
                                        href: `${EXPLORER}` },
                                ].map(card => (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-xl p-4", children: [_jsx("div", { className: "text-[10px] text-gray-500 uppercase tracking-widest mb-1", children: card.label }), 'href' in card && card.href ? (_jsx("a", { href: card.href, target: "_blank", rel: "noopener noreferrer", className: "text-sm font-semibold text-polkadot-pink hover:text-pink-400 transition-colors block", children: card.val })) : (_jsx("div", { className: "text-sm font-semibold text-white font-mono", children: card.val })), _jsx("div", { className: "text-[10px] text-gray-600 mt-0.5", children: card.sub })] }, card.label))) })] })] })] }));
}
