import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function scoreColor(score) {
    if (score >= 750)
        return '#34d399';
    if (score >= 500)
        return '#fbbf24';
    if (score >= 250)
        return '#fb923c';
    return '#f87171';
}
export function HistoryChart({ history }) {
    if (!history || history.length === 0)
        return null;
    const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
    const max = 1100;
    const W = 100, H = 50, pad = 5;
    const points = sorted.map((r, i) => ({
        x: sorted.length === 1 ? W / 2 : pad + (i / (sorted.length - 1)) * (W - pad * 2),
        y: H - pad - ((r.score / max) * (H - pad * 2)),
        record: r,
    }));
    const polyline = points.map(p => `${p.x},${p.y}`).join(' ');
    return (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden shadow-xl", children: [_jsxs("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20 flex items-center justify-between", children: [_jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-gray-500", children: "Score History" }), _jsx("span", { className: "text-[9px] font-mono text-gray-700", children: "0\u20131100" })] }), _jsx("div", { className: "px-4 pt-3 pb-1", children: _jsxs("svg", { viewBox: `0 0 ${W} ${H}`, className: "w-full h-20 overflow-visible", preserveAspectRatio: "none", children: [[0, 250, 500, 750, 1100].map(v => {
                            const y = H - pad - ((v / max) * (H - pad * 2));
                            return _jsx("line", { x1: pad, y1: y, x2: W - pad, y2: y, stroke: "#1f2937", strokeWidth: "0.4", strokeDasharray: "2,2" }, v);
                        }), points.length > 1 && (_jsx("polyline", { points: polyline, fill: "none", stroke: "#E6007A", strokeWidth: "1.5", strokeLinejoin: "round", strokeLinecap: "round", className: "drop-shadow-[0_0_6px_rgba(230,0,122,0.35)]" })), points.map((p, i) => (_jsx("circle", { cx: p.x, cy: p.y, r: "2", fill: scoreColor(p.record.score), className: "stroke-polkadot-dark stroke-[0.8px]" }, i)))] }) }), _jsx("div", { className: "px-4 pb-3 space-y-1.5 max-h-48 overflow-y-auto", children: sorted.slice().reverse().map(r => (_jsxs("div", { className: "flex items-center justify-between px-3 py-2 rounded-xl bg-polkadot-dark/50 border border-polkadot-border/50 hover:border-polkadot-pink/20 transition-all", children: [_jsxs("div", { children: [_jsx("span", { className: "font-mono font-bold text-xs", style: { color: scoreColor(r.score) }, children: r.score }), _jsx("span", { className: "text-gray-700 text-[9px] font-mono ml-1", children: "/1100" }), _jsx("div", { className: "text-[9px] text-gray-600 mt-0.5", children: new Date(r.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) })] }), _jsxs("a", { href: `https://polkadot.testnet.routescan.io/tx/${r.txHash}`, target: "_blank", rel: "noopener noreferrer", className: "bg-polkadot-pink/10 hover:bg-polkadot-pink/20 text-polkadot-pink px-2.5 py-1 rounded-lg text-[9px] font-mono font-bold transition-colors", children: [r.txHash.slice(0, 6), "\u2026 \u2197"] })] }, r.id))) })] }));
}
