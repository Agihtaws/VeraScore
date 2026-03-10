import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
const EXPLORER = 'https://polkadot.testnet.routescan.io';
const CAT_MAX = {
    transactionActivity: 200,
    accountAge: 100,
    nativeBalance: 150,
    usdtHolding: 200,
    usdcHolding: 150,
    accountComplexity: 200,
    runtimeModernity: 100,
};
const CAT_LABELS = {
    transactionActivity: 'Activity',
    accountAge: 'Age',
    nativeBalance: 'PAS',
    usdtHolding: 'USDT',
    usdcHolding: 'USDC',
    accountComplexity: 'Complexity',
    runtimeModernity: 'Modernity',
};
const TOTAL_MAX = 1100; // Matching your Mistral AI scale pa!
function scoreColor(score) {
    if (score >= 800)
        return 'text-emerald-400';
    if (score >= 600)
        return 'text-green-400';
    if (score >= 400)
        return 'text-amber-400';
    if (score >= 200)
        return 'text-orange-400';
    return 'text-red-400';
}
function rankBadge(rank) {
    if (rank === 1)
        return { bg: 'bg-yellow-500/10 border-yellow-500/30', text: 'text-yellow-400', icon: '🥇' };
    if (rank === 2)
        return { bg: 'bg-slate-400/10 border-slate-400/30', text: 'text-slate-300', icon: '🥈' };
    if (rank === 3)
        return { bg: 'bg-orange-700/10 border-orange-600/30', text: 'text-orange-400', icon: '🥉' };
    return { bg: 'bg-polkadot-card border-polkadot-border', text: 'text-gray-500', icon: '' };
}
// ── Mini breakdown bars ──
function BreakdownBars({ breakdown }) {
    return (_jsx("div", { className: "grid grid-cols-7 gap-2 mt-4 bg-black/20 p-4 rounded-xl border border-white/5", children: Object.entries(CAT_MAX).map(([key, max]) => {
            const val = breakdown[key] ?? 0;
            const pct = Math.round((val / max) * 100);
            return (_jsxs("div", { className: "flex flex-col items-center gap-1.5", children: [_jsx("div", { className: "w-full h-16 bg-polkadot-dark rounded-sm relative overflow-hidden flex items-end border border-white/5", children: _jsx("div", { className: "w-full bg-polkadot-pink/60 transition-all duration-1000 ease-out", style: { height: `${pct}%` } }) }), _jsx("div", { className: "text-[7px] text-gray-500 font-black uppercase tracking-tighter text-center leading-none", children: CAT_LABELS[key] }), _jsx("div", { className: "text-[9px] font-mono font-bold text-gray-400", children: val })] }, key));
        }) }));
}
function LeaderRow({ entry, expanded, onToggle }) {
    const colorClass = scoreColor(entry.score);
    const badge = rankBadge(entry.rank);
    const pct = Math.round((entry.score / TOTAL_MAX) * 100);
    let breakdown = {};
    try {
        breakdown = JSON.parse(entry.breakdown);
    }
    catch { /**/ }
    return (_jsxs("div", { className: `border rounded-2xl overflow-hidden transition-all duration-300 ${expanded ? 'ring-1 ring-polkadot-pink/30 shadow-lg' : ''} ${badge.bg}`, children: [_jsxs("button", { onClick: onToggle, className: "w-full text-left px-5 py-5 flex items-center gap-4 hover:bg-white/[0.03] transition-colors", children: [_jsx("div", { className: `w-8 shrink-0 text-center font-black text-xl ${badge.text}`, children: badge.icon || `#${entry.rank}` }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "flex items-center gap-2", children: _jsxs("span", { className: "font-mono text-sm font-bold text-white", children: [entry.address.slice(0, 10), "...", entry.address.slice(-6)] }) }), _jsx("div", { className: "text-[10px] font-bold text-gray-600 uppercase tracking-widest mt-1", children: new Date(entry.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) })] }), _jsxs("div", { className: "hidden md:block w-32 space-y-1", children: [_jsx("div", { className: "h-1 bg-black/40 rounded-full overflow-hidden", children: _jsx("div", { className: "h-full bg-polkadot-pink rounded-full transition-all duration-1000", style: { width: `${pct}%` } }) }), _jsxs("div", { className: "flex justify-between text-[8px] font-black uppercase text-gray-500 tracking-tighter", children: [_jsx("span", { children: "Power" }), _jsxs("span", { children: [pct, "%"] })] })] }), _jsxs("div", { className: "text-right shrink-0", children: [_jsx("div", { className: `text-2xl font-black font-mono tracking-tighter ${colorClass}`, children: entry.score }), _jsxs("div", { className: "text-[9px] font-bold text-gray-700 uppercase", children: ["/ ", TOTAL_MAX] })] }), _jsx("div", { className: `text-gray-700 transition-transform ${expanded ? 'rotate-180' : ''}`, children: "\u25BC" })] }), expanded && (_jsxs("div", { className: "px-5 pb-5 border-t border-white/5 bg-black/10", children: [_jsx(BreakdownBars, { breakdown: breakdown }), _jsxs("div", { className: "mt-4 flex items-center justify-between", children: [_jsx("span", { className: "text-[9px] font-black text-gray-600 uppercase tracking-widest", children: "Mint Evidence" }), _jsxs("a", { href: `${EXPLORER}/tx/${entry.txHash}`, target: "_blank", rel: "noopener noreferrer", className: "text-[10px] font-mono text-polkadot-pink hover:underline", children: [entry.txHash.slice(0, 20), "... \u2197"] })] })] }))] }));
}
export function Leaderboard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expanded, setExpanded] = useState(null);
    const load = useCallback(async () => {
        try {
            const res = await fetch('/score/leaderboard');
            const json = await res.json();
            if (!json.success)
                throw new Error('Failed to fetch');
            setData(json);
        }
        catch (err) {
            setError(err.message);
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        const id = setInterval(load, 30000);
        return () => clearInterval(id);
    }, [load]);
    if (loading && !data)
        return (_jsxs("div", { className: "py-20 text-center space-y-4", children: [_jsx("div", { className: "w-10 h-10 border-2 border-polkadot-pink border-t-transparent rounded-full animate-spin mx-auto" }), _jsx("div", { className: "text-gray-500 text-xs font-black uppercase tracking-widest", children: "Compiling Rankings..." })] }));
    const entries = data?.entries ?? [];
    return (_jsxs("div", { className: "max-w-3xl mx-auto px-4 py-12 space-y-10", children: [_jsxs("div", { className: "text-center space-y-2", children: [_jsxs("h1", { className: "text-4xl font-black tracking-tighter uppercase italic text-white", children: ["Network ", _jsx("span", { className: "text-polkadot-pink", children: "Leaderboard" })] }), _jsx("p", { className: "text-gray-500 text-xs font-black uppercase tracking-[0.3em]", children: "Top Credit Profiles \u00B7 Paseo Asset Hub" })] }), _jsx("div", { className: "grid grid-cols-3 gap-4", children: [
                    { label: 'Wallets', value: data?.totalWallets ?? 0, icon: '🌐' },
                    { label: 'Top Score', value: entries[0]?.score ?? 0, icon: '🔥' },
                    { label: 'Max Cap', value: TOTAL_MAX, icon: '💎' },
                ].map(s => (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl p-5 text-center shadow-xl", children: [_jsx("div", { className: "text-xl mb-1", children: s.icon }), _jsx("div", { className: "text-xl font-black font-mono text-white", children: s.value }), _jsx("div", { className: "text-[9px] font-black text-gray-600 uppercase tracking-widest", children: s.label })] }, s.label))) }), entries.length > 0 && (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-3xl p-6 space-y-4 shadow-2xl", children: [_jsx("div", { className: "text-[10px] text-gray-500 font-black uppercase tracking-widest", children: "Score Density" }), _jsx("div", { className: "flex items-end gap-1 h-16 px-2", children: entries.map(e => (_jsx("div", { className: `flex-1 rounded-t-sm transition-all duration-1000 ${e.rank <= 3 ? 'bg-polkadot-pink' : 'bg-white/10'}`, style: { height: `${(e.score / TOTAL_MAX) * 100}%` } }, e.rank))) }), _jsxs("div", { className: "flex justify-between text-[8px] font-black text-gray-700 uppercase tracking-tighter", children: [_jsx("span", { children: "Rank #1" }), _jsxs("span", { children: ["Rank #", entries.length] })] })] })), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex justify-between items-center px-1", children: [_jsx("span", { className: "text-[10px] font-black text-gray-600 uppercase tracking-widest", children: "Verified Participants" }), _jsx("button", { onClick: load, className: "text-[10px] font-black text-polkadot-pink uppercase hover:opacity-70 transition-opacity", children: "Refresh" })] }), entries.length === 0 ? (_jsx("div", { className: "py-20 text-center bg-polkadot-card border border-polkadot-border rounded-3xl opacity-50", children: _jsx("div", { className: "text-gray-500 font-black uppercase tracking-widest", children: "No Records Found" }) })) : (entries.map(entry => (_jsx(LeaderRow, { entry: entry, expanded: expanded === entry.rank, onToggle: () => setExpanded(expanded === entry.rank ? null : entry.rank) }, entry.rank))))] }), _jsxs("div", { className: "text-center text-[9px] font-bold text-gray-700 uppercase tracking-widest", children: ["Live Data Stream \u00B7 Polkadot SDK \u00B7 Updated ", new Date().toLocaleTimeString()] })] }));
}
