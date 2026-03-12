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
    accountComplexity: 'Complex',
    runtimeModernity: 'Runtime',
};
const TOTAL_MAX = Object.values(CAT_MAX).reduce((a, b) => a + b, 0); // 1100
function scoreColor(s) {
    if (s >= 750)
        return 'text-emerald-400';
    if (s >= 500)
        return 'text-yellow-400';
    if (s >= 250)
        return 'text-orange-400';
    return 'text-red-400';
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
function rankStyle(rank) {
    if (rank === 1)
        return { ring: 'border-yellow-500/40  bg-yellow-500/5', num: 'text-yellow-400', icon: '🥇' };
    if (rank === 2)
        return { ring: 'border-gray-400/30    bg-white/[0.02]', num: 'text-gray-300', icon: '🥈' };
    if (rank === 3)
        return { ring: 'border-orange-600/40  bg-orange-500/5', num: 'text-orange-400', icon: '🥉' };
    return { ring: 'border-polkadot-border bg-polkadot-card', num: 'text-gray-600', icon: '' };
}
function fmtAddr(addr) { return `${addr.slice(0, 8)}…${addr.slice(-5)}`; }
function fmtDate(ts) {
    return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function BreakdownBars({ breakdown }) {
    return (_jsx("div", { className: "grid grid-cols-7 gap-1 pt-3", children: Object.entries(CAT_MAX).map(([key, max]) => {
            const val = breakdown[key] ?? 0;
            const pct = Math.round((val / max) * 100);
            return (_jsxs("div", { className: "flex flex-col items-center gap-1", children: [_jsx("div", { className: "w-full h-10 bg-polkadot-dark rounded relative overflow-hidden flex items-end", children: _jsx("div", { className: "w-full bg-polkadot-pink/60 rounded transition-all duration-700", style: { height: `${pct}%`, minHeight: pct > 0 ? '2px' : '0' } }) }), _jsx("div", { className: "text-[7px] text-gray-600 text-center leading-tight", children: CAT_LABELS[key] }), _jsx("div", { className: "text-[8px] font-mono text-gray-600", children: val })] }, key));
        }) }));
}
function LeaderRow({ entry, expanded, onToggle }) {
    const { ring, num, icon } = rankStyle(entry.rank);
    const pct = Math.round((entry.score / TOTAL_MAX) * 100);
    let breakdown = {};
    try {
        breakdown = JSON.parse(entry.breakdown);
    }
    catch { /* ignore */ }
    return (_jsxs("div", { className: `border rounded-2xl overflow-hidden transition-all ${ring}`, children: [_jsxs("button", { onClick: onToggle, className: "w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors", children: [_jsx("div", { className: `w-7 shrink-0 text-center font-black text-sm ${num}`, children: icon || `#${entry.rank}` }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("span", { className: "font-mono text-xs text-white", children: fmtAddr(entry.address) }), _jsx("a", { href: `${EXPLORER}/address/${entry.address}`, target: "_blank", rel: "noopener noreferrer", onClick: e => e.stopPropagation(), className: "text-gray-700 hover:text-polkadot-pink transition-colors text-[10px]", children: "\u2197" })] }), _jsx("div", { className: "text-[9px] text-gray-600 mt-0.5", children: fmtDate(entry.timestamp) })] }), _jsxs("div", { className: "hidden sm:block w-24 space-y-1", children: [_jsx("div", { className: "h-1 bg-black/40 rounded-full overflow-hidden", children: _jsx("div", { className: "h-full rounded-full bg-polkadot-pink transition-all duration-700", style: { width: `${pct}%` } }) }), _jsx("div", { className: `text-[8px] font-bold ${scoreColor(entry.score)}`, children: scoreLabel(entry.score) })] }), _jsxs("div", { className: "text-right shrink-0", children: [_jsx("div", { className: `text-xl font-black font-mono ${entry.rank <= 3 ? num : 'text-white'}`, children: entry.score }), _jsxs("div", { className: "text-[8px] text-gray-700", children: ["/", TOTAL_MAX] })] }), _jsx("svg", { className: `w-3.5 h-3.5 text-gray-600 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2.5, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M19 9l-7 7-7-7" }) })] }), expanded && (_jsxs("div", { className: "px-4 pb-4 border-t border-white/5", children: [_jsx(BreakdownBars, { breakdown: breakdown }), _jsxs("div", { className: "mt-2.5 flex items-center justify-between", children: [_jsx("span", { className: "text-[8px] font-bold uppercase tracking-widest text-gray-700", children: "Mint Tx" }), _jsxs("a", { href: `${EXPLORER}/tx/${entry.txHash}`, target: "_blank", rel: "noopener noreferrer", className: "text-[9px] font-mono text-gray-600 hover:text-polkadot-pink transition-colors", children: [entry.txHash.slice(0, 12), "\u2026", entry.txHash.slice(-5), " \u2197"] })] })] }))] }));
}
export function Leaderboard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expanded, setExpanded] = useState(null);
    const [lastFetch, setLastFetch] = useState(0);
    const load = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch('/score/leaderboard');
            if (!res.ok)
                throw new Error(`Server error ${res.status}`);
            const json = await res.json();
            if (!json.success)
                throw new Error('Failed to load leaderboard');
            setData(json);
            setLastFetch(Date.now());
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { const id = setInterval(load, 30_000); return () => clearInterval(id); }, [load]);
    const toggle = (rank) => setExpanded(prev => prev === rank ? null : rank);
    if (loading && !data) {
        return (_jsxs("div", { className: "max-w-2xl mx-auto px-4 py-16 flex flex-col items-center gap-3", children: [_jsx("div", { className: "w-6 h-6 border-2 border-polkadot-pink border-t-transparent rounded-full animate-spin" }), _jsx("div", { className: "text-gray-600 text-xs", children: "Loading leaderboard\u2026" })] }));
    }
    if (error) {
        return (_jsxs("div", { className: "max-w-2xl mx-auto px-4 py-16 text-center space-y-3", children: [_jsx("div", { className: "text-3xl", children: "\u26A0" }), _jsx("div", { className: "text-red-400 text-xs", children: error }), _jsx("button", { onClick: load, className: "bg-polkadot-pink hover:bg-pink-600 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors", children: "Retry" })] }));
    }
    const entries = data?.entries ?? [];
    return (_jsxs("div", { className: "max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-xl font-black tracking-tight text-white", children: ["Score ", _jsx("span", { className: "text-polkadot-pink", children: "Leaderboard" })] }), _jsx("p", { className: "text-[10px] text-gray-600 mt-0.5 font-medium", children: "Top wallets on PAS TestNet \u00B7 Auto-refreshes every 30s" })] }), _jsx("div", { className: "grid grid-cols-3 gap-2", children: [
                    { label: 'Wallets', value: (data?.totalWallets ?? 0).toString() },
                    { label: 'Top Score', value: entries[0] ? `${entries[0].score}` : '—' },
                    { label: 'Max Possible', value: TOTAL_MAX.toString() },
                ].map(({ label, value }) => (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-xl px-3 py-2.5 text-center", children: [_jsx("div", { className: "text-sm font-black font-mono text-white", children: value }), _jsx("div", { className: "text-[8px] font-bold uppercase tracking-widest text-gray-700 mt-0.5", children: label })] }, label))) }), entries.length > 0 && (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsxs("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20 flex items-center justify-between", children: [_jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-gray-500", children: "Distribution" }), _jsxs("span", { className: "text-[9px] font-mono text-gray-700", children: [entries.length, " wallets"] })] }), _jsx("div", { className: "px-4 py-3 flex items-end gap-1.5 h-16", children: entries.map(e => {
                            const h = Math.max(4, Math.round((e.score / TOTAL_MAX) * 48));
                            return (_jsxs("div", { title: `#${e.rank}: ${e.score}`, className: "flex-1 flex flex-col justify-end items-center gap-0.5", children: [_jsx("div", { className: `w-full rounded-t ${e.rank === 1 ? 'bg-yellow-500/70' :
                                            e.rank === 2 ? 'bg-gray-400/50' :
                                                e.rank === 3 ? 'bg-orange-500/60' : 'bg-polkadot-pink/40'}`, style: { height: `${h}px` } }), _jsx("span", { className: `text-[7px] font-mono ${scoreColor(e.score)}`, children: e.score })] }, e.rank));
                        }) })] })), entries.length === 0 ? (_jsxs("div", { className: "text-center py-12 space-y-2", children: [_jsx("div", { className: "text-4xl", children: "\uD83C\uDFC6" }), _jsx("div", { className: "text-white text-sm font-semibold", children: "No scores yet" }), _jsx("div", { className: "text-gray-600 text-xs", children: "Be the first to mint a VeraScore NFT!" })] })) : (_jsxs("div", { className: "space-y-1.5", children: [_jsx("div", { className: "text-[8px] font-bold uppercase tracking-widest text-gray-700 px-1", children: "Tap any row for breakdown" }), entries.map(entry => (_jsx(LeaderRow, { entry: entry, expanded: expanded === entry.rank, onToggle: () => toggle(entry.rank) }, entry.rank)))] })), _jsxs("div", { className: "flex items-center justify-between text-[9px] text-gray-700", children: [lastFetch > 0 && _jsxs("span", { children: ["Updated ", new Date(lastFetch).toLocaleTimeString()] }), _jsx("button", { onClick: load, className: "hover:text-gray-400 transition-colors underline underline-offset-2", children: "Refresh now" })] })] }));
}
