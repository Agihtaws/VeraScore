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
        return 'text-amber-400';
    if (s >= 250)
        return 'text-orange-400';
    return 'text-red-400';
}
function scoreBg(s) {
    if (s >= 750)
        return 'bg-emerald-400';
    if (s >= 500)
        return 'bg-amber-400';
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
    return (_jsx("div", { className: "w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" }));
}
function ResultCard({ result, compact = false, showNFT = true, showHistory = true }) {
    if (!result.hasScore || result.score === undefined) {
        return (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-3xl p-10 text-center space-y-4 shadow-2xl", children: [_jsx("div", { className: "text-5xl opacity-20 italic font-black text-gray-500", children: "NULL_DATA" }), _jsxs("div", { className: "space-y-1", children: [_jsx("div", { className: "text-gray-300 font-black uppercase tracking-widest text-sm", children: "No VeraScore Found" }), _jsx("div", { className: "text-gray-600 text-[10px] font-mono break-all max-w-xs mx-auto", children: result.address })] })] }));
    }
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-3xl overflow-hidden shadow-2xl", children: [_jsxs("div", { className: `px-6 ${compact ? 'pt-6 pb-6' : 'pt-10 pb-8'} border-b border-polkadot-border text-center space-y-4 bg-gradient-to-b from-white/5 to-transparent`, children: [_jsx("div", { className: `${compact ? 'text-6xl' : 'text-8xl'} font-black font-mono tracking-tighter leading-none ${scoreColor(result.score)} drop-shadow-[0_0_15px_rgba(0,0,0,0.3)]`, children: result.score }), _jsxs("div", { className: "text-gray-500 text-[10px] font-black uppercase tracking-[0.2em]", children: ["Credit Rating ", _jsx("span", { className: "text-gray-700", children: "/ 1100" })] }), _jsx("div", { className: "max-w-xs mx-auto", children: _jsx("div", { className: "h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5", children: _jsx("div", { className: `h-full rounded-full transition-all duration-1000 ease-out ${scoreBg(result.score)}`, style: { width: `${Math.min((result.score / 1100) * 100, 100)}%` } }) }) }), _jsxs("div", { className: "flex items-center justify-center gap-2", children: [_jsx("span", { className: `text-[10px] font-black px-3 py-1 rounded-full border uppercase tracking-tight ${result.score >= 750 ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' :
                                            result.score >= 500 ? 'border-amber-500/30 text-amber-400 bg-amber-500/10' :
                                                'border-orange-500/30 text-orange-400 bg-orange-500/10'}`, children: scoreLabel(result.score) }), _jsx("span", { className: `text-[10px] font-black px-3 py-1 rounded-full border uppercase tracking-tight ${result.isValid ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-red-500/30 text-red-400 bg-red-500/10'}`, children: result.isValid ? '✦ Valid' : 'Expired' })] })] }), !compact && (_jsx("div", { className: "px-8 py-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-[10px] uppercase font-black border-b border-polkadot-border bg-black/10", children: [
                            ['Identity', _jsxs("span", { className: "font-mono text-gray-400 truncate lowercase", children: [result.address.slice(0, 12), "...", result.address.slice(-8)] })],
                            ['Timestamp', _jsx("span", { className: "text-gray-400 font-mono", children: fmtFull(result.issuedAt ?? 0) })],
                            [result.isValid ? 'Expiry' : 'Expired On', _jsx("span", { className: result.isValid ? 'text-emerald-400 font-mono' : 'text-red-400 font-mono', children: fmt(result.expiresAt ?? 0) })],
                            ['Network Stats', _jsxs("span", { className: "text-gray-400 font-mono", children: [result.totalScored, " Scored"] })],
                        ].map(([label, value], i) => (_jsxs("div", { className: "flex justify-between items-center border-b border-white/5 pb-2 last:border-0", children: [_jsx("span", { className: "text-gray-600 tracking-widest", children: label }), _jsx("span", { className: "text-right", children: value })] }, i))) })), _jsx("div", { className: "px-6 py-4", children: result.refreshAvailableAt && result.refreshAvailableAt > Math.floor(Date.now() / 1000) ? (_jsxs("div", { className: "bg-amber-500/5 border border-amber-500/10 rounded-xl px-4 py-3 text-[10px] text-amber-500 font-black uppercase text-center tracking-widest", children: ["\uD83D\uDD12 Lock Active \u00B7 Refresh available ", fmt(result.refreshAvailableAt)] })) : (_jsx("div", { className: "bg-emerald-500/5 border border-emerald-500/10 rounded-xl px-4 py-3 text-[10px] text-emerald-500 font-black uppercase text-center tracking-widest", children: "\u2726 VeraScore Live \u00B7 Verified on Substrate" })) })] }), showNFT && result.score > 0 && _jsx(NFTViewer, { wallet: result.address, proxyAddress: SCORE_NFT_PROXY }), showHistory && (result.history ?? []).length > 0 && _jsx(HistoryChart, { history: result.history })] }));
}
function CompareTable({ a, b }) {
    if (!a.hasScore || !b.hasScore || a.score === undefined || b.score === undefined)
        return null;
    const winner = a.score >= b.score ? 'a' : 'b';
    const rows = [
        ['Score', a.score.toString(), b.score.toString()],
        ['Rating', scoreLabel(a.score), scoreLabel(b.score)],
        ['Status', a.isValid ? 'Valid' : 'Expired', b.isValid ? 'Valid' : 'Expired'],
        ['Issued', a.issuedAt ? fmt(a.issuedAt) : '—', b.issuedAt ? fmt(b.issuedAt) : '—'],
    ];
    return (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-3xl overflow-hidden shadow-2xl", children: [_jsx("div", { className: "px-6 py-4 border-b border-polkadot-border bg-white/5", children: _jsx("div", { className: "text-[10px] text-gray-500 uppercase tracking-[0.2em] font-black", children: "Head-to-Head Comparison" }) }), _jsxs("div", { className: "grid grid-cols-3 px-8 py-4 border-b border-polkadot-border text-[10px] font-black uppercase tracking-widest bg-black/20", children: [_jsx("div", { className: "text-gray-600", children: "Protocol Metric" }), _jsxs("div", { className: `text-center truncate ${winner === 'a' ? 'text-polkadot-pink' : 'text-gray-500'}`, children: [winner === 'a' && '🏆 ', " ", a.address.slice(0, 6)] }), _jsxs("div", { className: `text-center truncate ${winner === 'b' ? 'text-polkadot-pink' : 'text-gray-500'}`, children: [winner === 'b' && '🏆 ', " ", b.address.slice(0, 6)] })] }), rows.map(([label, va, vb]) => {
                const isScore = label === 'Score';
                const aWins = isScore && Number(va) >= Number(vb);
                const bWins = isScore && Number(vb) > Number(va);
                return (_jsxs("div", { className: "grid grid-cols-3 px-8 py-4 border-b border-white/5 text-[11px] font-bold last:border-0", children: [_jsx("div", { className: "text-gray-500 uppercase tracking-tighter", children: label }), _jsx("div", { className: `text-center font-mono ${aWins ? scoreColor(Number(va)) : 'text-gray-300'}`, children: va }), _jsx("div", { className: `text-center font-mono ${bWins ? scoreColor(Number(vb)) : 'text-gray-300'}`, children: vb })] }, label));
            }), _jsx("div", { className: "px-6 py-5 bg-polkadot-dark text-center", children: _jsxs("span", { className: "text-[10px] font-black uppercase text-gray-500 tracking-widest", children: ["Differential: ", _jsxs("span", { className: "text-white font-mono text-xs ml-1", children: ["+", Math.abs(a.score - b.score), " PTS"] })] }) })] }));
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
            setError('Invalid EVM Address (0x + 40 chars)');
            return;
        }
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            const res = await fetch(`/score/${addr}`);
            const json = await res.json();
            if (!res.ok)
                throw new Error('Query Failed');
            setResult(json);
        }
        catch (err) {
            setError('Network error or address not found');
        }
        finally {
            setLoading(false);
        }
    }
    async function handleCompare() {
        const addrA = inputA.trim(), addrB = inputB.trim();
        if (!isValidAddr(addrA) || !isValidAddr(addrB)) {
            setErrorC('Both inputs must be valid 0x addresses');
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
        await Promise.all([fetchOne(addrA, setResultA, setLoadingA), fetchOne(addrB, setResultB, setLoadingB)]);
    }
    return (_jsx("div", { className: "max-w-7xl mx-auto px-4 py-12", children: _jsxs("div", { className: "max-w-4xl mx-auto space-y-12", children: [_jsxs("div", { className: "text-center space-y-3", children: [_jsxs("h2", { className: "text-4xl font-black tracking-tighter uppercase italic text-white", children: ["VeraScore ", _jsx("span", { className: "text-polkadot-pink", children: "Lookup" })] }), _jsx("p", { className: "text-gray-500 text-xs font-black uppercase tracking-[0.3em]", children: "Public Verifier \u00B7 Substrate Native Data" })] }), _jsx("div", { className: "flex justify-center", children: _jsx("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl p-1.5 flex gap-1.5 shadow-lg", children: ['single', 'compare'].map(m => (_jsx("button", { onClick: () => setMode(m), className: `px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mode === m ? 'bg-polkadot-pink text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`, children: m === 'single' ? 'Identity' : 'Compare' }, m))) }) }), mode === 'single' && (_jsxs("div", { className: "space-y-8 max-w-2xl mx-auto", children: [_jsxs("div", { className: "flex gap-3", children: [_jsx("input", { type: "text", placeholder: "ENTER 0x WALLET ADDRESS...", value: input, onChange: e => setInput(e.target.value), onKeyDown: e => e.key === 'Enter' && !loading && handleLookup(), className: "flex-1 bg-polkadot-card border border-polkadot-border rounded-2xl px-6 py-4 text-sm font-mono text-white placeholder-gray-800 outline-none focus:border-polkadot-pink/40 shadow-inner transition-all" }), _jsx("button", { onClick: handleLookup, disabled: loading || !input.trim(), className: "bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 text-white font-black uppercase tracking-widest px-8 py-4 rounded-2xl transition-all shadow-lg active:scale-95", children: loading ? _jsx(Spinner, {}) : 'VERIFY' })] }), error && _jsx("div", { className: "bg-red-500/10 border border-red-500/20 rounded-2xl px-5 py-4 text-red-400 text-[10px] font-black uppercase text-center tracking-widest", children: error }), result && _jsx(ResultCard, { result: result })] })), mode === 'compare' && (_jsxs("div", { className: "space-y-8", children: [_jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [['A', inputA, setInputA], ['B', inputB, setInputB]].map(([lbl, val, setter]) => (_jsxs("div", { className: "space-y-2", children: [_jsxs("label", { className: "text-[10px] text-gray-600 font-black uppercase tracking-widest ml-1", children: ["Wallet ", lbl] }), _jsx("input", { type: "text", placeholder: "0x...", value: val, onChange: e => setter(e.target.value), className: "w-full bg-polkadot-card border border-polkadot-border rounded-2xl px-5 py-4 text-sm font-mono text-white placeholder-gray-800 outline-none focus:border-polkadot-pink/40 shadow-inner transition-all" })] }, lbl))) }), _jsx("button", { onClick: handleCompare, disabled: loadingA || loadingB || !inputA.trim() || !inputB.trim(), className: "w-full bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 text-white font-black uppercase tracking-widest py-5 rounded-2xl transition-all shadow-lg active:scale-[0.98]", children: loadingA || loadingB ? _jsxs("div", { className: "flex items-center justify-center gap-2", children: [_jsx(Spinner, {}), " PROFILING..."] }) : '⚖️ RUN HEAD-TO-HEAD' }), errorC && _jsx("div", { className: "bg-red-500/10 border border-red-500/20 rounded-2xl px-5 py-4 text-red-400 text-[10px] font-black uppercase text-center tracking-widest", children: errorC }), (resultA || resultB || loadingA || loadingB) && (_jsxs("div", { className: "space-y-10", children: [resultA?.hasScore && resultB?.hasScore && _jsx(CompareTable, { a: resultA, b: resultB }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-8", children: ['A', 'B'].map((lbl, idx) => {
                                        const l = idx === 0 ? loadingA : loadingB;
                                        const r = idx === 0 ? resultA : resultB;
                                        return (_jsxs("div", { className: "space-y-4", children: [_jsx("div", { className: "text-[10px] text-gray-500 font-black uppercase tracking-widest text-center", children: l ? '⏳ Profiling...' : `Profile ${lbl}` }), l ? _jsx("div", { className: "bg-polkadot-card border border-polkadot-border rounded-3xl p-12 flex justify-center", children: _jsx(Spinner, {}) }) : r ? _jsx(ResultCard, { result: r, compact: true, showNFT: false, showHistory: false }) : null] }, lbl));
                                    }) })] }))] }))] }) }));
}
