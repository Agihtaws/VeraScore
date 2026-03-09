import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
const EXPLORER = 'https://polkadot.testnet.routescan.io';
// Max scores per category — must match contract
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
    transactionActivity: 'Tx Activity',
    accountAge: 'Account Age',
    nativeBalance: 'PAS Balance',
    usdtHolding: 'USDT',
    usdcHolding: 'USDC',
    accountComplexity: 'Complexity',
    runtimeModernity: 'Modernity',
};
const TOTAL_MAX = Object.values(CAT_MAX).reduce((a, b) => a + b, 0); // 1100
function scoreLabel(score) {
    if (score >= 800)
        return { label: 'Excellent', color: 'text-emerald-400' };
    if (score >= 600)
        return { label: 'Good', color: 'text-green-400' };
    if (score >= 400)
        return { label: 'Fair', color: 'text-yellow-400' };
    if (score >= 200)
        return { label: 'Poor', color: 'text-orange-400' };
    return { label: 'Very Poor', color: 'text-red-400' };
}
function rankBadge(rank) {
    if (rank === 1)
        return { bg: 'bg-yellow-500/20 border-yellow-500/40', text: 'text-yellow-400', icon: '🥇' };
    if (rank === 2)
        return { bg: 'bg-gray-400/10  border-gray-400/30', text: 'text-gray-300', icon: '🥈' };
    if (rank === 3)
        return { bg: 'bg-orange-700/20 border-orange-600/40', text: 'text-orange-400', icon: '🥉' };
    return { bg: 'bg-polkadot-card   border-polkadot-border', text: 'text-gray-500', icon: '' };
}
function fmtAddr(addr) {
    return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}
function fmtDate(ts) {
    return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
// ── Mini breakdown bar chart ──────────────────────────────────────────────────
function BreakdownBars({ breakdown }) {
    return (_jsx("div", { className: "grid grid-cols-7 gap-1 mt-3", children: Object.entries(CAT_MAX).map(([key, max]) => {
            const val = breakdown[key] ?? 0;
            const pct = Math.round((val / max) * 100);
            return (_jsxs("div", { className: "flex flex-col items-center gap-1", children: [_jsx("div", { className: "w-full h-16 bg-polkadot-dark rounded-sm relative overflow-hidden flex items-end", children: _jsx("div", { className: "w-full rounded-sm bg-polkadot-pink/70 transition-all duration-700", style: { height: `${pct}%`, minHeight: pct > 0 ? '2px' : '0' } }) }), _jsx("div", { className: "text-[8px] text-gray-600 text-center leading-tight", children: CAT_LABELS[key] }), _jsx("div", { className: "text-[9px] font-mono text-gray-500", children: val })] }, key));
        }) }));
}
// ── Single leaderboard row ────────────────────────────────────────────────────
function LeaderRow({ entry, expanded, onToggle }) {
    const { label, color } = scoreLabel(entry.score);
    const badge = rankBadge(entry.rank);
    const pct = Math.round((entry.score / TOTAL_MAX) * 100);
    let breakdown = {};
    try {
        breakdown = JSON.parse(entry.breakdown);
    }
    catch { /* ignore */ }
    return (_jsxs("div", { className: `border rounded-2xl overflow-hidden transition-colors ${badge.bg}`, children: [_jsxs("button", { onClick: onToggle, className: "w-full text-left px-4 py-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors", children: [_jsx("div", { className: `w-8 shrink-0 text-center font-bold text-lg ${badge.text}`, children: badge.icon || `#${entry.rank}` }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "font-mono text-sm text-white", children: fmtAddr(entry.address) }), _jsx("a", { href: `${EXPLORER}/address/${entry.address}`, target: "_blank", rel: "noopener noreferrer", onClick: e => e.stopPropagation(), className: "text-gray-600 hover:text-polkadot-pink transition-colors text-xs", children: "\u2197" })] }), _jsx("div", { className: "text-[11px] text-gray-600 mt-0.5", children: fmtDate(entry.timestamp) })] }), _jsxs("div", { className: "hidden sm:flex flex-col gap-1 w-32", children: [_jsx("div", { className: "w-full h-1.5 bg-polkadot-dark rounded-full overflow-hidden", children: _jsx("div", { className: "h-full rounded-full bg-polkadot-pink transition-all duration-700", style: { width: `${pct}%` } }) }), _jsxs("div", { className: "flex items-center justify-between text-[10px]", children: [_jsx("span", { className: `font-medium ${color}`, children: label }), _jsxs("span", { className: "text-gray-600 font-mono", children: [pct, "%"] })] })] }), _jsxs("div", { className: "text-right shrink-0", children: [_jsx("div", { className: `text-2xl font-bold font-mono ${entry.rank <= 3 ? badge.text : 'text-white'}`, children: entry.score }), _jsxs("div", { className: "text-[10px] text-gray-600", children: ["/ ", TOTAL_MAX] })] }), _jsx("div", { className: `text-gray-600 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`, children: _jsx("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M19 9l-7 7-7-7" }) }) })] }), expanded && (_jsxs("div", { className: "px-4 pb-4 border-t border-white/5", children: [_jsx(BreakdownBars, { breakdown: breakdown }), _jsxs("div", { className: "mt-3 flex items-center justify-between text-[11px]", children: [_jsx("span", { className: "text-gray-600", children: "Mint tx" }), _jsxs("a", { href: `${EXPLORER}/tx/${entry.txHash}`, target: "_blank", rel: "noopener noreferrer", className: "font-mono text-gray-500 hover:text-polkadot-pink transition-colors", children: [entry.txHash.slice(0, 12), "\u2026", entry.txHash.slice(-6), " \u2197"] })] })] }))] }));
}
// ── Main page ─────────────────────────────────────────────────────────────────
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
    // Auto-refresh every 30s
    useEffect(() => {
        const id = setInterval(load, 30_000);
        return () => clearInterval(id);
    }, [load]);
    const toggle = (rank) => setExpanded(prev => prev === rank ? null : rank);
    // ── Loading ──────────────────────────────────────────────────────────────
    if (loading && !data) {
        return (_jsxs("div", { className: "max-w-2xl mx-auto px-4 py-16 text-center space-y-4", children: [_jsx("div", { className: "w-10 h-10 border-2 border-polkadot-pink border-t-transparent rounded-full animate-spin mx-auto" }), _jsx("div", { className: "text-gray-500 text-sm", children: "Loading leaderboard\u2026" })] }));
    }
    // ── Error ────────────────────────────────────────────────────────────────
    if (error) {
        return (_jsxs("div", { className: "max-w-2xl mx-auto px-4 py-16 text-center space-y-4", children: [_jsx("div", { className: "text-4xl", children: "\u26A0" }), _jsx("div", { className: "text-red-400 text-sm", children: error }), _jsx("button", { onClick: load, className: "bg-polkadot-pink hover:bg-pink-600 text-white px-5 py-2 rounded-xl text-sm transition-colors", children: "Retry" })] }));
    }
    const entries = data?.entries ?? [];
    return (_jsxs("div", { className: "max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-6", children: [_jsxs("div", { className: "text-center space-y-2", children: [_jsxs("h1", { className: "text-2xl font-bold", children: ["Score ", _jsx("span", { className: "text-polkadot-pink", children: "Leaderboard" })] }), _jsx("p", { className: "text-gray-500 text-sm", children: "Top wallets ranked by highest VeraScore on PAS TestNet" })] }), _jsx("div", { className: "grid grid-cols-3 gap-3", children: [
                    { label: 'Wallets Scored', value: (data?.totalWallets ?? 0).toString(), icon: '🏅' },
                    { label: 'Top Score', value: entries[0] ? `${entries[0].score}` : '—', icon: '🥇' },
                    { label: 'Max Possible', value: TOTAL_MAX.toString(), icon: '⭐' },
                ].map(({ label, value, icon }) => (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-xl py-4 px-3 text-center space-y-1", children: [_jsx("div", { className: "text-2xl", children: icon }), _jsx("div", { className: "font-mono font-bold text-white text-lg", children: value }), _jsx("div", { className: "text-gray-600 text-[10px] uppercase tracking-wider", children: label })] }, label))) }), entries.length > 0 && (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl p-4 space-y-3", children: [_jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "Score Distribution" }), _jsx("div", { className: "flex items-end gap-1.5 h-12", children: entries.map(e => {
                            const h = Math.max(4, Math.round((e.score / TOTAL_MAX) * 48));
                            const { color } = scoreLabel(e.score);
                            return (_jsxs("div", { className: "flex-1 flex flex-col items-center gap-1", children: [_jsx("div", { className: `w-full rounded-t-sm ${e.rank === 1 ? 'bg-yellow-500/70' :
                                            e.rank === 2 ? 'bg-gray-400/50' :
                                                e.rank === 3 ? 'bg-orange-500/60' : 'bg-polkadot-pink/40'}`, style: { height: `${h}px` } }), _jsx("div", { className: `text-[8px] font-mono ${color}`, children: e.score })] }, e.rank));
                        }) }), _jsxs("div", { className: "flex justify-between text-[9px] text-gray-700", children: [_jsx("span", { children: "#1 highest" }), _jsxs("span", { children: ["#", entries.length, " on board"] })] })] })), entries.length === 0 ? (_jsxs("div", { className: "text-center py-16 space-y-3", children: [_jsx("div", { className: "text-5xl", children: "\uD83C\uDFC6" }), _jsx("div", { className: "text-white font-semibold", children: "No scores yet" }), _jsx("div", { className: "text-gray-500 text-sm", children: "Be the first to mint a VeraScore NFT!" })] })) : (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "text-xs text-gray-600 px-1", children: ["Top ", entries.length, " wallets \u00B7 Click any row to see breakdown"] }), entries.map(entry => (_jsx(LeaderRow, { entry: entry, expanded: expanded === entry.rank, onToggle: () => toggle(entry.rank) }, entry.rank)))] })), _jsxs("div", { className: "text-center text-[11px] text-gray-700 space-x-2", children: [_jsx("span", { children: "Auto-refreshes every 30s" }), lastFetch > 0 && (_jsxs("span", { children: ["\u00B7 Last updated ", new Date(lastFetch).toLocaleTimeString()] })), _jsx("button", { onClick: load, className: "text-gray-600 hover:text-gray-400 transition-colors underline underline-offset-2", children: "Refresh now" })] })] }));
}
