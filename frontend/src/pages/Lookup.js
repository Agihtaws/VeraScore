import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { HistoryChart } from '../components/HistoryChart';
import { NFTViewer } from '../components/NFTViewer';
import { SCORE_NFT_PROXY } from '../utils/wagmi';
const EXPLORER = 'https://polkadot.testnet.routescan.io';
function scoreColor(s) {
    if (s >= 750)
        return 'text-emerald-400';
    if (s >= 500)
        return 'text-yellow-400';
    if (s >= 250)
        return 'text-orange-400';
    return 'text-red-400';
}
function scoreBg(s) {
    if (s >= 750)
        return 'bg-emerald-400';
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
    return (_jsxs("svg", { className: "animate-spin h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8v8H4z" })] }));
}
function ResultCard({ result, compact = false, showNFT = true, showHistory = true }) {
    if (!result.hasScore || result.score === undefined) {
        return (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl p-8 text-center space-y-2", children: [_jsx("div", { className: "text-3xl", children: "\uD83D\uDD0D" }), _jsx("div", { className: "text-xs font-semibold text-gray-500", children: "No Score Found" }), _jsx("div", { className: "text-gray-700 text-[10px] font-mono break-all", children: result.address })] }));
    }
    const pct = Math.min((result.score / 1100) * 100, 100);
    return (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden shadow-xl", children: [_jsxs("div", { className: `px-5 ${compact ? 'pt-5 pb-4' : 'pt-6 pb-5'} border-b border-polkadot-border text-center space-y-3`, children: [_jsx("div", { className: `${compact ? 'text-4xl' : 'text-6xl'} font-black font-mono tracking-tight ${scoreColor(result.score)}`, children: result.score }), _jsx("div", { className: "text-[8px] font-bold text-gray-700 uppercase tracking-widest", children: "out of 1100" }), _jsx("div", { className: "max-w-48 mx-auto", children: _jsx("div", { className: "h-1 bg-black/40 rounded-full overflow-hidden border border-white/5", children: _jsx("div", { className: `h-full rounded-full transition-all duration-700 ${scoreBg(result.score)}`, style: { width: `${pct}%` } }) }) }), _jsxs("div", { className: "flex items-center justify-center gap-1.5 flex-wrap", children: [_jsx("span", { className: `text-[8px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-wide ${result.score >= 750 ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5' :
                                            result.score >= 500 ? 'border-yellow-500/30  text-yellow-400  bg-yellow-500/5' :
                                                result.score >= 250 ? 'border-orange-500/30  text-orange-400  bg-orange-500/5' :
                                                    'border-red-500/30     text-red-400     bg-red-500/5'}`, children: scoreLabel(result.score) }), result.isValid
                                        ? _jsx("span", { className: "text-[8px] font-bold px-2.5 py-1 rounded-full border border-emerald-500/30 text-emerald-400 bg-emerald-500/5 uppercase tracking-wide", children: "\u2713 Valid" })
                                        : _jsx("span", { className: "text-[8px] font-bold px-2.5 py-1 rounded-full border border-red-500/30 text-red-400 bg-red-500/5 uppercase tracking-wide", children: "\u2717 Expired" })] })] }), !compact && (_jsx("div", { className: "grid grid-cols-2 gap-px bg-polkadot-border border-b border-polkadot-border", children: [
                            ['Address', _jsxs("span", { className: "font-mono text-white text-[10px]", children: [result.address.slice(0, 10), "\u2026", result.address.slice(-6)] })],
                            ['Issued', _jsx("span", { className: "text-gray-400 text-[10px]", children: fmtFull(result.issuedAt ?? 0) })],
                            [result.isValid ? 'Expires' : 'Expired', _jsx("span", { className: `text-[10px] ${result.isValid ? 'text-emerald-400' : 'text-red-400'}`, children: fmt(result.expiresAt ?? 0) })],
                            ['Total Scored', _jsxs("span", { className: "text-gray-400 text-[10px]", children: [result.totalScored, " wallets"] })],
                        ].map(([label, value], i) => (_jsxs("div", { className: "bg-polkadot-card px-4 py-3 space-y-1", children: [_jsx("div", { className: "text-[8px] font-bold text-gray-700 uppercase tracking-widest", children: label }), _jsx("div", { children: value })] }, i))) })), _jsx("div", { className: "px-4 py-3", children: result.refreshAvailableAt && result.refreshAvailableAt > 0 ? (_jsxs("div", { className: "bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-3 py-2 text-[9px] font-semibold text-yellow-400 text-center", children: ["\uD83D\uDD12 Refresh locked until ", fmt(result.refreshAvailableAt)] })) : !result.isValid ? (_jsx("div", { className: "bg-blue-500/5 border border-blue-500/20 rounded-xl px-3 py-2 text-[9px] font-semibold text-blue-400 text-center", children: "Score expired \u2014 wallet owner can refresh on the Score tab" })) : (_jsx("div", { className: "bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-3 py-2 text-[9px] font-semibold text-emerald-400 text-center", children: "\u2713 Live & verifiable on-chain" })) })] }), showNFT && result.score > 0 && (_jsx(NFTViewer, { wallet: result.address, proxyAddress: SCORE_NFT_PROXY, label: "Score NFT", initialDelay: 500 })), showHistory && (result.history ?? []).length > 0 && (_jsx(HistoryChart, { history: result.history })), !compact && (_jsxs("div", { className: "flex items-center justify-center gap-4", children: [_jsx("a", { href: `${EXPLORER}/address/${result.address}`, target: "_blank", rel: "noopener noreferrer", className: "text-[9px] font-bold uppercase tracking-widest text-gray-600 hover:text-polkadot-pink transition-colors", children: "View Wallet \u2197" }), _jsx("span", { className: "text-gray-800", children: "\u00B7" }), _jsx("a", { href: `${EXPLORER}/address/${SCORE_NFT_PROXY}`, target: "_blank", rel: "noopener noreferrer", className: "text-[9px] font-bold uppercase tracking-widest text-gray-600 hover:text-polkadot-pink transition-colors", children: "View Contract \u2197" })] }))] }));
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
    return (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden shadow-xl", children: [_jsxs("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20 flex items-center justify-between", children: [_jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-gray-500", children: "Head-to-Head" }), _jsxs("span", { className: "text-xs font-black text-polkadot-pink font-mono", children: ["\u0394 ", Math.abs(a.score - b.score), " pts"] })] }), _jsxs("div", { className: "grid grid-cols-3 px-4 py-2.5 border-b border-polkadot-border bg-black/10", children: [_jsx("div", { className: "text-[8px] font-bold uppercase tracking-widest text-gray-700", children: "Metric" }), _jsxs("div", { className: `text-[8px] font-bold uppercase tracking-widest text-center truncate ${winner === 'a' ? 'text-polkadot-pink' : 'text-gray-600'}`, children: [winner === 'a' && '🏆 ', a.address.slice(0, 8), "\u2026"] }), _jsxs("div", { className: `text-[8px] font-bold uppercase tracking-widest text-center truncate ${winner === 'b' ? 'text-polkadot-pink' : 'text-gray-600'}`, children: [winner === 'b' && '🏆 ', b.address.slice(0, 8), "\u2026"] })] }), rows.map(([label, va, vb]) => {
                const isScore = label === 'Score';
                const aWins = isScore && Number(va) >= Number(vb);
                const bWins = isScore && Number(vb) > Number(va);
                return (_jsxs("div", { className: "grid grid-cols-3 px-4 py-2.5 border-b border-polkadot-border/40 last:border-0", children: [_jsx("div", { className: "text-[9px] font-bold text-gray-600", children: label }), _jsx("div", { className: `text-[10px] font-bold font-mono text-center ${aWins ? scoreColor(Number(va)) : 'text-gray-400'}`, children: va }), _jsx("div", { className: `text-[10px] font-bold font-mono text-center ${bWins ? scoreColor(Number(vb)) : 'text-gray-400'}`, children: vb })] }, label));
            }), _jsxs("div", { className: "px-4 py-3 bg-black/20 text-center text-[9px] font-semibold text-gray-500", children: ["Winner: ", _jsxs("span", { className: "text-polkadot-pink font-mono", children: [(winner === 'a' ? a : b).address.slice(0, 10), "\u2026"] })] })] }));
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
    return (_jsxs("div", { className: "max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-xl font-black tracking-tight text-white", children: ["Score ", _jsx("span", { className: "text-polkadot-pink", children: "Lookup" })] }), _jsx("p", { className: "text-[10px] text-gray-600 mt-0.5 font-medium", children: "Check any wallet \u00B7 No connection needed" })] }), _jsx("div", { className: "bg-polkadot-card border border-polkadot-border rounded-xl p-1 flex gap-1 w-fit", children: ['single', 'compare'].map(m => (_jsx("button", { onClick: () => setMode(m), className: `px-5 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${mode === m
                        ? 'bg-polkadot-pink text-white shadow-[0_0_10px_rgba(230,0,122,0.25)]'
                        : 'text-gray-600 hover:text-gray-300'}`, children: m === 'single' ? '⌕ Single' : '⚖ Compare' }, m))) }), mode === 'single' && (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex gap-2", children: [_jsx("input", { type: "text", placeholder: "0x\u2026 wallet address", value: input, onChange: e => setInput(e.target.value), onKeyDown: e => e.key === 'Enter' && !loading && handleLookup(), className: "flex-1 bg-polkadot-card border border-polkadot-border rounded-xl px-4 py-2.5 text-xs font-mono text-white placeholder-gray-700 focus:outline-none focus:border-polkadot-pink/40 transition-colors" }), _jsx("button", { onClick: handleLookup, disabled: loading || !input.trim(), className: "bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-widest px-5 py-2.5 rounded-xl transition-all shadow-[0_0_12px_rgba(230,0,122,0.2)] shrink-0", children: loading ? _jsx(Spinner, {}) : 'Look Up' })] }), error && (_jsxs("div", { className: "bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-2.5 text-xs font-semibold text-red-400", children: ["\u2717 ", error] })), result && !result.hasScore && (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl p-8 text-center space-y-2", children: [_jsx("div", { className: "text-3xl", children: "\uD83D\uDD0D" }), _jsx("div", { className: "text-xs font-semibold text-gray-500", children: "No Score Found" }), _jsx("div", { className: "text-gray-700 text-[10px] font-mono break-all", children: result.address }), _jsxs("div", { className: "text-[9px] text-gray-700", children: ["Total wallets scored: ", _jsx("span", { className: "text-gray-500", children: result.totalScored })] })] })), result?.hasScore && _jsx(ResultCard, { result: result })] })), mode === 'compare' && (_jsxs("div", { className: "space-y-4", children: [_jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: [['A', inputA, setInputA], ['B', inputB, setInputB]].map(([lbl, val, setter]) => (_jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "text-[8px] font-bold uppercase tracking-widest text-gray-700", children: ["Wallet ", lbl] }), _jsx("input", { type: "text", placeholder: `0x… wallet ${lbl}`, value: val, onChange: e => setter(e.target.value), onKeyDown: e => e.key === 'Enter' && !comparing && handleCompare(), className: "w-full bg-polkadot-card border border-polkadot-border rounded-xl px-4 py-2.5 text-xs font-mono text-white placeholder-gray-700 focus:outline-none focus:border-polkadot-pink/40 transition-colors" })] }, lbl))) }), _jsx("button", { onClick: handleCompare, disabled: comparing || !inputA.trim() || !inputB.trim(), className: "w-full bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-widest py-3 rounded-xl transition-all shadow-[0_0_12px_rgba(230,0,122,0.2)]", children: comparing
                            ? _jsxs("span", { className: "flex items-center justify-center gap-2", children: [_jsx(Spinner, {}), " Comparing\u2026"] })
                            : '⚖ Compare Wallets' }), errorC && (_jsxs("div", { className: "bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-2.5 text-xs font-semibold text-red-400", children: ["\u2717 ", errorC] })), (resultA || resultB || loadingA || loadingB) && (_jsxs("div", { className: "space-y-4", children: [resultA?.hasScore && resultB?.hasScore && _jsx(CompareTable, { a: resultA, b: resultB }), _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: ['A', 'B'].map(lbl => {
                                    const l = lbl === 'A' ? loadingA : loadingB;
                                    const r = lbl === 'A' ? resultA : resultB;
                                    return (_jsxs("div", { className: "space-y-1.5", children: [_jsx("div", { className: "text-[8px] font-bold uppercase tracking-widest text-gray-700 text-center", children: l ? '⏳ Loading…' : `Wallet ${lbl}` }), l ? (_jsx("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl p-8 flex justify-center", children: _jsx(Spinner, {}) })) : r ? (_jsx(ResultCard, { result: r, compact: true, showNFT: false, showHistory: false })) : null] }, lbl));
                                }) }), resultA?.hasScore && resultB?.hasScore && (_jsxs("div", { className: "flex items-center justify-center gap-4", children: [_jsx("a", { href: `${EXPLORER}/address/${resultA.address}`, target: "_blank", rel: "noopener noreferrer", className: "text-[9px] font-bold uppercase tracking-widest text-gray-600 hover:text-polkadot-pink transition-colors", children: "Wallet A \u2197" }), _jsx("span", { className: "text-gray-800", children: "\u00B7" }), _jsx("a", { href: `${EXPLORER}/address/${resultB.address}`, target: "_blank", rel: "noopener noreferrer", className: "text-[9px] font-bold uppercase tracking-widest text-gray-600 hover:text-polkadot-pink transition-colors", children: "Wallet B \u2197" }), _jsx("span", { className: "text-gray-800", children: "\u00B7" }), _jsx("a", { href: `${EXPLORER}/address/${SCORE_NFT_PROXY}`, target: "_blank", rel: "noopener noreferrer", className: "text-[9px] font-bold uppercase tracking-widest text-gray-600 hover:text-polkadot-pink transition-colors", children: "Contract \u2197" })] }))] }))] }))] }));
}
