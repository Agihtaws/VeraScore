import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { HistoryChart } from '../components/HistoryChart.js';
import { NFTViewer } from '../components/NFTViewer.js';
import { SCORE_NFT_PROXY } from '../utils/wagmi.js';
const EXPLORER = 'https://polkadot.testnet.routescan.io';
function scoreColor(s) {
    if (s >= 750)
        return 'text-green-400';
    if (s >= 500)
        return 'text-yellow-400';
    if (s >= 250)
        return 'text-orange-400';
    return 'text-red-400';
}
function scoreBg(s) {
    if (s >= 750)
        return 'bg-green-400';
    if (s >= 500)
        return 'bg-yellow-400';
    if (s >= 250)
        return 'bg-orange-400';
    return 'bg-red-400';
}
function scoreLabel(s) {
    if (s >= 750)
        return 'Excellent';
    if (s >= 500)
        return 'Good';
    if (s >= 250)
        return 'Fair';
    return 'New Wallet';
}
function fmt(ts) {
    return new Date(ts * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtFull(ts) { return new Date(ts * 1000).toLocaleString(); }
function isValidAddr(a) { return a.startsWith('0x') && a.length === 42; }
function Spinner() {
    return (_jsxs("svg", { className: "animate-spin h-4 w-4", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8v8H4z" })] }));
}
function ResultCard({ result, compact = false, showNFT = true, showHistory = true }) {
    if (!result.hasScore || result.score === undefined) {
        return (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl p-6 text-center space-y-2", children: [_jsx("div", { className: "text-3xl", children: "\uD83D\uDD0D" }), _jsx("div", { className: "text-gray-300 font-medium", children: "No score found" }), _jsx("div", { className: "text-gray-600 text-xs font-mono break-all", children: result.address })] }));
    }
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsxs("div", { className: `px-6 ${compact ? 'pt-5 pb-4' : 'pt-8 pb-6'} border-b border-polkadot-border text-center space-y-3`, children: [_jsx("div", { className: `${compact ? 'text-5xl' : 'text-7xl'} font-bold font-mono ${scoreColor(result.score)}`, children: result.score }), _jsx("div", { className: "text-gray-500 text-xs", children: "out of 1100" }), _jsx("div", { className: "max-w-xs mx-auto", children: _jsx("div", { className: "h-2 bg-polkadot-border rounded-full overflow-hidden", children: _jsx("div", { className: `h-full rounded-full transition-all duration-700 ${scoreBg(result.score)}`, style: { width: `${Math.min((result.score / 1100) * 100, 100)}%` } }) }) }), _jsxs("div", { className: "flex items-center justify-center gap-2 flex-wrap", children: [_jsx("span", { className: `text-xs font-semibold px-3 py-1 rounded-full border ${result.score >= 750 ? 'border-green-800 text-green-400 bg-green-950' :
                                            result.score >= 500 ? 'border-yellow-800 text-yellow-400 bg-yellow-950' :
                                                result.score >= 250 ? 'border-orange-800 text-orange-400 bg-orange-950' :
                                                    'border-red-800 text-red-400 bg-red-950'}`, children: scoreLabel(result.score) }), result.isValid
                                        ? _jsx("span", { className: "text-xs font-semibold px-3 py-1 rounded-full border border-green-800 text-green-400 bg-green-950", children: "\u2713 Valid" })
                                        : _jsx("span", { className: "text-xs font-semibold px-3 py-1 rounded-full border border-red-800 text-red-400 bg-red-950", children: "\u2717 Expired" })] })] }), !compact && (_jsx("div", { className: "px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs border-b border-polkadot-border", children: [
                            ['Address', _jsx("span", { className: "font-mono text-gray-300 truncate max-w-[220px] block", children: result.address })],
                            ['Issued', _jsx("span", { className: "text-gray-300", children: fmtFull(result.issuedAt ?? 0) })],
                            [result.isValid ? 'Expires' : 'Expired', _jsx("span", { className: result.isValid ? 'text-green-400' : 'text-red-400', children: fmt(result.expiresAt ?? 0) })],
                            ['Total scored', _jsxs("span", { className: "text-gray-300", children: [result.totalScored, " wallets"] })],
                        ].map(([label, value], i) => (_jsxs("div", { className: "flex justify-between items-start gap-4", children: [_jsx("span", { className: "text-gray-500 shrink-0", children: label }), _jsx("span", { className: "text-right", children: value })] }, i))) })), _jsx("div", { className: "px-6 py-4", children: result.refreshAvailableAt && result.refreshAvailableAt > 0 ? (_jsxs("div", { className: "bg-yellow-950 border border-yellow-800 rounded-xl px-4 py-2.5 text-xs text-yellow-300 text-center", children: ["\uD83D\uDD12 Refresh locked until ", _jsx("span", { className: "font-semibold", children: fmt(result.refreshAvailableAt) })] })) : !result.isValid ? (_jsx("div", { className: "bg-blue-950 border border-blue-800 rounded-xl px-4 py-2.5 text-xs text-blue-300 text-center", children: "Score expired \u2014 wallet owner can generate a new score on the Score tab" })) : (_jsx("div", { className: "bg-green-950 border border-green-800 rounded-xl px-4 py-2.5 text-xs text-green-300 text-center", children: "\u2713 Score is live and verifiable on-chain" })) })] }), showNFT && result.score > 0 && _jsx(NFTViewer, { wallet: result.address, proxyAddress: SCORE_NFT_PROXY }), showHistory && (result.history ?? []).length > 0 && _jsx(HistoryChart, { history: result.history }), !compact && (_jsxs("div", { className: "flex items-center justify-center gap-4 text-xs", children: [_jsx("a", { href: `${EXPLORER}/address/${result.address}`, target: "_blank", rel: "noopener noreferrer", className: "text-gray-500 hover:text-polkadot-pink transition-colors", children: "View wallet \u2197" }), _jsx("span", { className: "text-gray-700", children: "\u00B7" }), _jsx("a", { href: `${EXPLORER}/address/${SCORE_NFT_PROXY}`, target: "_blank", rel: "noopener noreferrer", className: "text-gray-500 hover:text-polkadot-pink transition-colors", children: "View contract \u2197" })] }))] }));
}
function CompareTable({ a, b }) {
    if (!a.hasScore || !b.hasScore || a.score === undefined || b.score === undefined)
        return null;
    const winner = a.score >= b.score ? 'a' : 'b';
    const rows = [
        ['Score', a.score.toString(), b.score.toString()],
        ['Rating', scoreLabel(a.score), scoreLabel(b.score)],
        ['Valid', a.isValid ? '✓ Valid' : '✗ Expired', b.isValid ? '✓ Valid' : '✗ Expired'],
        ['Issued', a.issuedAt ? fmt(a.issuedAt) : '—', b.issuedAt ? fmt(b.issuedAt) : '—'],
        ['Expires', a.expiresAt ? fmt(a.expiresAt) : '—', b.expiresAt ? fmt(b.expiresAt) : '—'],
    ];
    return (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsx("div", { className: "px-6 py-4 border-b border-polkadot-border", children: _jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "Head-to-Head" }) }), _jsxs("div", { className: "grid grid-cols-3 px-6 py-3 border-b border-polkadot-border text-xs text-gray-500", children: [_jsx("div", { children: "Metric" }), _jsxs("div", { className: `text-center font-mono truncate ${winner === 'a' ? 'text-polkadot-pink font-semibold' : ''}`, children: [winner === 'a' && '🏆 ', a.address.slice(0, 8), "\u2026"] }), _jsxs("div", { className: `text-center font-mono truncate ${winner === 'b' ? 'text-polkadot-pink font-semibold' : ''}`, children: [winner === 'b' && '🏆 ', b.address.slice(0, 8), "\u2026"] })] }), rows.map(([label, va, vb]) => {
                const isScore = label === 'Score';
                const aWins = isScore && Number(va) >= Number(vb);
                const bWins = isScore && Number(vb) > Number(va);
                return (_jsxs("div", { className: "grid grid-cols-3 px-6 py-2.5 border-b border-polkadot-border/40 text-xs last:border-0", children: [_jsx("div", { className: "text-gray-500", children: label }), _jsx("div", { className: `text-center font-mono ${aWins ? scoreColor(Number(va)) + ' font-bold' : 'text-gray-300'}`, children: va }), _jsx("div", { className: `text-center font-mono ${bWins ? scoreColor(Number(vb)) + ' font-bold' : 'text-gray-300'}`, children: vb })] }, label));
            }), _jsxs("div", { className: "px-6 py-4 bg-polkadot-dark text-center text-xs text-gray-400", children: ["Score difference:", ' ', _jsxs("span", { className: "font-mono font-bold text-white", children: [Math.abs(a.score - b.score), " pts"] }), ' ', "in favour of", ' ', _jsxs("span", { className: "font-mono text-polkadot-pink", children: [(winner === 'a' ? a : b).address.slice(0, 10), "\u2026"] })] })] }));
}
export function Lookup() {
    const [mode, setMode] = useState('single');
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [inputA, setInputA] = useState('');
    const [inputB, setInputB] = useState('');
    const [loadingA, setLoadingA] = useState(false);
    const [loadingB, setLoadingB] = useState(false);
    const [resultA, setResultA] = useState(null);
    const [resultB, setResultB] = useState(null);
    const [errorC, setErrorC] = useState(null);
    async function handleLookup() {
        const addr = input.trim();
        if (!isValidAddr(addr)) {
            setError('Enter a valid 0x address (42 chars)');
            return;
        }
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            const res = await fetch(`/score/${addr}`);
            const json = await res.json();
            if (!res.ok)
                throw new Error('Lookup failed. Please try again.');
            setResult(json);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Lookup failed');
        }
        finally {
            setLoading(false);
        }
    }
    async function handleCompare() {
        const addrA = inputA.trim(), addrB = inputB.trim();
        if (!isValidAddr(addrA) || !isValidAddr(addrB)) {
            setErrorC('Both addresses must be valid 0x addresses (42 chars)');
            return;
        }
        if (addrA.toLowerCase() === addrB.toLowerCase()) {
            setErrorC('Enter two different wallet addresses');
            return;
        }
        setErrorC(null);
        setResultA(null);
        setResultB(null);
        setLoadingA(true);
        setLoadingB(true);
        const fetchOne = async (addr, setRes, setLoad) => {
            try {
                const res = await fetch(`/score/${addr}`);
                setRes(await res.json());
            }
            catch {
                setRes(null);
            }
            finally {
                setLoad(false);
            }
        };
        await Promise.all([
            fetchOne(addrA, setResultA, setLoadingA),
            fetchOne(addrB, setResultB, setLoadingB),
        ]);
    }
    const comparing = loadingA || loadingB;
    return (_jsx("div", { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-10", children: _jsxs("div", { className: "max-w-5xl mx-auto space-y-8", children: [_jsxs("div", { className: "text-center space-y-2", children: [_jsxs("h2", { className: "text-3xl font-bold", children: ["Public ", _jsx("span", { className: "text-polkadot-pink", children: "Score Lookup" })] }), _jsx("p", { className: "text-gray-400 text-sm", children: "Check any wallet's on-chain VeraScore. No wallet connection needed." })] }), _jsx("div", { className: "flex justify-center", children: _jsx("div", { className: "bg-polkadot-card border border-polkadot-border rounded-xl p-1 flex gap-1", children: ['single', 'compare'].map(m => (_jsx("button", { onClick: () => setMode(m), className: `px-5 py-2 rounded-lg text-sm font-medium transition-colors ${mode === m ? 'bg-polkadot-pink text-white' : 'text-gray-400 hover:text-white'}`, children: m === 'single' ? '🔍 Single' : '⚖️ Compare' }, m))) }) }), mode === 'single' && (_jsxs("div", { className: "space-y-6 max-w-2xl mx-auto", children: [_jsxs("div", { className: "flex gap-2", children: [_jsx("input", { type: "text", placeholder: "0x... wallet address", value: input, onChange: e => setInput(e.target.value), onKeyDown: e => e.key === 'Enter' && !loading && handleLookup(), className: "flex-1 bg-polkadot-card border border-polkadot-border rounded-xl px-4 py-3 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-polkadot-pink transition-colors" }), _jsx("button", { onClick: handleLookup, disabled: loading || !input.trim(), className: "bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-xl transition-colors shrink-0", children: loading ? _jsx(Spinner, {}) : 'Look Up' })] }), error && _jsx("div", { className: "bg-red-950 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm", children: error }), result && !result.hasScore && (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl p-8 text-center space-y-3", children: [_jsx("div", { className: "text-4xl", children: "\uD83D\uDD0D" }), _jsx("div", { className: "text-gray-300 font-medium text-lg", children: "No score found" }), _jsx("div", { className: "text-gray-600 text-xs font-mono break-all", children: result.address }), _jsxs("div", { className: "text-gray-600 text-sm", children: ["Total wallets scored: ", _jsx("span", { className: "text-gray-400 font-semibold", children: result.totalScored })] })] })), result?.hasScore && _jsx(ResultCard, { result: result })] })), mode === 'compare' && (_jsxs("div", { className: "space-y-6", children: [_jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: [['A', inputA, setInputA], ['B', inputB, setInputB]].map(([lbl, val, setter]) => (_jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "text-xs text-gray-500 uppercase tracking-widest px-1", children: ["Wallet ", lbl] }), _jsx("input", { type: "text", placeholder: `0x... wallet ${lbl}`, value: val, onChange: e => setter(e.target.value), onKeyDown: e => e.key === 'Enter' && !comparing && handleCompare(), className: "w-full bg-polkadot-card border border-polkadot-border rounded-xl px-4 py-3 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-polkadot-pink transition-colors" })] }, lbl))) }), _jsx("button", { onClick: handleCompare, disabled: comparing || !inputA.trim() || !inputB.trim(), className: "w-full bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors", children: comparing
                                ? _jsxs("span", { className: "flex items-center justify-center gap-2", children: [_jsx(Spinner, {}), " Comparing\u2026"] })
                                : '⚖️ Compare Wallets' }), errorC && _jsx("div", { className: "bg-red-950 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm", children: errorC }), (resultA || resultB || loadingA || loadingB) && (_jsxs("div", { className: "space-y-6", children: [resultA?.hasScore && resultB?.hasScore && _jsx(CompareTable, { a: resultA, b: resultB }), _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4", children: ['A', 'B'].map(lbl => {
                                        const loading_ = lbl === 'A' ? loadingA : loadingB;
                                        const result_ = lbl === 'A' ? resultA : resultB;
                                        return (_jsxs("div", { className: "space-y-2", children: [_jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest text-center", children: loading_ ? '⏳ Loading…' : `Wallet ${lbl}` }), loading_ ? (_jsx("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl p-8 flex justify-center", children: _jsx(Spinner, {}) })) : result_ ? (_jsx(ResultCard, { result: result_, compact: true, showNFT: false, showHistory: false })) : null] }, lbl));
                                    }) }), resultA?.hasScore && resultB?.hasScore && (_jsxs("div", { className: "flex items-center justify-center gap-4 text-xs", children: [_jsx("a", { href: `${EXPLORER}/address/${resultA.address}`, target: "_blank", rel: "noopener noreferrer", className: "text-gray-500 hover:text-polkadot-pink transition-colors", children: "Wallet A \u2197" }), _jsx("span", { className: "text-gray-700", children: "\u00B7" }), _jsx("a", { href: `${EXPLORER}/address/${resultB.address}`, target: "_blank", rel: "noopener noreferrer", className: "text-gray-500 hover:text-polkadot-pink transition-colors", children: "Wallet B \u2197" }), _jsx("span", { className: "text-gray-700", children: "\u00B7" }), _jsx("a", { href: `${EXPLORER}/address/${SCORE_NFT_PROXY}`, target: "_blank", rel: "noopener noreferrer", className: "text-gray-500 hover:text-polkadot-pink transition-colors", children: "Contract \u2197" })] }))] }))] }))] }) }));
}
