import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Matching your app's color palette pa!
function scoreColor(score) {
    if (score >= 750)
        return '#34d399'; // Emerald 400 (Excellent)
    if (score >= 500)
        return '#fbbf24'; // Amber 400 (Good)
    if (score >= 250)
        return '#fb923c'; // Orange 400 (Fair)
    return '#f87171'; // Red 400 (Poor)
}
export function HistoryChart({ history }) {
    if (!history || history.length === 0)
        return null;
    // 1. Sort by time and set the max scale to 1100 (matching your Mistral AI scale!)
    const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
    const max = 1100;
    const W = 100;
    const H = 60;
    const pad = 6;
    const points = sorted.map((r, i) => {
        const x = sorted.length === 1
            ? W / 2
            : pad + (i / (sorted.length - 1)) * (W - pad * 2);
        const y = H - pad - ((r.score / max) * (H - pad * 2));
        return { x, y, record: r };
    });
    const polyline = points.map(p => `${p.x},${p.y}`).join(' ');
    return (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl p-6 space-y-4 shadow-xl", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest font-bold", children: "Growth History" }), _jsx("div", { className: "text-[10px] text-gray-600 font-mono", children: "Scale: 0\u20131100" })] }), _jsx("div", { className: "relative group", children: _jsxs("svg", { viewBox: `0 0 ${W} ${H}`, className: "w-full h-32 overflow-visible", preserveAspectRatio: "none", children: [[0, 250, 500, 750, 1100].map(v => {
                            const y = H - pad - ((v / max) * (H - pad * 2));
                            return (_jsx("line", { x1: pad, y1: y, x2: W - pad, y2: y, stroke: "#1f2937", strokeWidth: "0.5", strokeDasharray: "2,2" }, v));
                        }), points.length > 1 && (_jsx("polyline", { points: polyline, fill: "none", stroke: "#E6007A", strokeWidth: "2", strokeLinejoin: "round", strokeLinecap: "round", className: "drop-shadow-[0_0_8px_rgba(230,0,122,0.4)]" })), points.map((p, i) => (_jsx("circle", { cx: p.x, cy: p.y, r: "2.5", fill: scoreColor(p.record.score), className: "stroke-polkadot-dark stroke-[1px] transition-all hover:r-4" }, i)))] }) }), _jsx("div", { className: "space-y-3 max-h-60 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-800", children: sorted.slice().reverse().map((r) => {
                    return (_jsxs("div", { className: "flex items-center justify-between p-3 rounded-xl bg-polkadot-dark/40 border border-polkadot-border/50 hover:border-polkadot-pink/30 transition-all", children: [_jsxs("div", { className: "space-y-1", children: [_jsxs("div", { className: "font-mono font-bold text-sm", style: { color: scoreColor(r.score) }, children: [r.score, " ", _jsx("span", { className: "text-[10px] opacity-50 text-gray-400", children: "/ 1100" })] }), _jsx("div", { className: "text-[10px] text-gray-500 font-medium", children: new Date(r.timestamp).toLocaleDateString('en-GB', {
                                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                                        }) })] }), _jsxs("a", { href: `https://polkadot.testnet.routescan.io/tx/${r.txHash}`, target: "_blank", rel: "noopener noreferrer", className: "bg-polkadot-pink/10 hover:bg-polkadot-pink/20 text-polkadot-pink px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-colors flex items-center gap-1", children: [r.txHash.slice(0, 6), "... \u2197"] })] }, r.id));
                }) })] }));
}
