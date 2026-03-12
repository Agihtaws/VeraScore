import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useBalance } from 'wagmi';
import { pasTestnet, USDT_ERC20, USDC_ERC20, STABLECOIN_DECIMALS } from '../utils/wagmi';
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
const PAS_UNITS = 10n ** 18n;
function formatPAS(wei) {
    try {
        const v = BigInt(wei);
        return `${(v / PAS_UNITS).toString()} PAS`;
    }
    catch {
        return '0 PAS';
    }
}
function fmt(ts) {
    return new Date(ts * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function Bar({ label, value, max, score }) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return (_jsxs("div", { className: "space-y-1", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-[9px] font-bold uppercase tracking-widest text-gray-600", children: label }), _jsxs("span", { className: "text-[9px] font-mono text-gray-500", children: [value, _jsxs("span", { className: "text-gray-700", children: ["/", max] })] })] }), _jsx("div", { className: "h-1 bg-black/40 rounded-full overflow-hidden border border-white/5", children: _jsx("div", { className: `h-full rounded-full transition-all duration-700 ${scoreBg(score)}`, style: { width: `${pct}%` } }) })] }));
}
export function ScoreCard({ payload, expiresAt }) {
    const { score, reasoning, breakdown, rawChainData } = payload;
    const expiry = expiresAt ?? Math.floor(rawChainData.queriedAt / 1000) + 2 * 3600;
    const isValid = Math.floor(Date.now() / 1000) <= expiry;
    const { data: liveBalance } = useBalance({
        address: rawChainData.address, chainId: pasTestnet.id,
        query: { refetchInterval: 10_000, staleTime: 10_000 },
    });
    const { data: liveUSDT } = useBalance({
        address: rawChainData.address, token: USDT_ERC20, chainId: pasTestnet.id,
        query: { refetchInterval: 10_000, staleTime: 10_000 },
    });
    const { data: liveUSDC } = useBalance({
        address: rawChainData.address, token: USDC_ERC20, chainId: pasTestnet.id,
        query: { refetchInterval: false, staleTime: Infinity },
    });
    function formatStable(value, symbol) {
        const units = 10n ** BigInt(STABLECOIN_DECIMALS);
        const whole = value / units;
        const frac = value % units;
        const fracStr = frac.toString().padStart(STABLECOIN_DECIMALS, '0').replace(/0+$/, '');
        return fracStr.length > 0 ? `${whole.toLocaleString()}.${fracStr} ${symbol}` : `${whole.toLocaleString()} ${symbol}`;
    }
    function formatStableRaw(raw, symbol) {
        try {
            const v = BigInt(raw);
            return v === 0n ? '—' : formatStable(v, symbol);
        }
        catch {
            return raw;
        }
    }
    const usdtDisplay = liveUSDT ? (liveUSDT.value === 0n ? '—' : formatStable(liveUSDT.value, 'USDT')) : formatStableRaw(rawChainData.usdtBalance, 'USDT');
    const usdcDisplay = liveUSDC ? (liveUSDC.value === 0n ? '—' : formatStable(liveUSDC.value, 'USDC')) : formatStableRaw(rawChainData.usdcBalance, 'USDC');
    const pasDisplay = liveBalance
        ? `${Number(liveBalance.value) / 1e18 < 0.001 ? '<0.001' : (Number(liveBalance.value) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 })} PAS`
        : formatPAS(rawChainData.freeBalance);
    const pasDotClass = liveBalance && liveBalance.value > 0n ? 'bg-emerald-500 animate-pulse' : 'bg-gray-700';
    const usdtDotClass = liveUSDT && liveUSDT.value > 0n ? 'bg-emerald-500 animate-pulse' : 'bg-gray-700';
    const usdcDotClass = liveUSDC && liveUSDC.value > 0n ? 'bg-emerald-500 animate-pulse' : 'bg-gray-700';
    return (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden shadow-xl", children: [_jsxs("div", { className: "px-5 pt-6 pb-5 border-b border-polkadot-border text-center space-y-3 bg-gradient-to-b from-white/[0.03] to-transparent", children: [_jsx("div", { className: `text-6xl font-black font-mono tracking-tight leading-none ${scoreColor(score)}`, children: score }), _jsx("div", { className: "text-[8px] font-bold text-gray-700 uppercase tracking-widest", children: "Credit Score / 1100" }), _jsx("div", { className: "max-w-48 mx-auto", children: _jsx("div", { className: "h-1 bg-black/40 rounded-full overflow-hidden border border-white/5", children: _jsx("div", { className: `h-full rounded-full transition-all duration-700 ${scoreBg(score)}`, style: { width: `${(score / 1100) * 100}%` } }) }) }), _jsxs("div", { className: "flex items-center justify-center gap-1.5", children: [_jsx("span", { className: `text-[8px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-wide ${score >= 750 ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5' :
                                    score >= 500 ? 'border-amber-500/30   text-amber-400   bg-amber-500/5' :
                                        'border-orange-500/30  text-orange-400  bg-orange-500/5'}`, children: scoreLabel(score) }), _jsx("span", { className: `text-[8px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-wide ${isValid ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5'
                                    : 'border-red-500/30     text-red-400     bg-red-500/5'}`, children: isValid ? '✦ Valid' : 'Expired' })] }), _jsx("div", { className: "text-[9px] text-gray-700", children: isValid ? `Refresh after ${fmt(expiry)}` : `Expired ${fmt(expiry)}` })] }), _jsxs("div", { className: "px-5 py-4 border-b border-polkadot-border bg-black/10", children: [_jsx("div", { className: "text-[8px] font-black uppercase tracking-widest text-gray-700 mb-2", children: "Mistral AI Analysis" }), _jsxs("p", { className: "text-gray-400 text-xs leading-relaxed italic", children: ["\"", reasoning, "\""] })] }), _jsxs("div", { className: "px-5 py-4 border-b border-polkadot-border space-y-3", children: [_jsx("div", { className: "text-[8px] font-black uppercase tracking-widest text-gray-700", children: "Risk Parameters" }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3", children: [_jsxs("div", { className: "space-y-3", children: [_jsx(Bar, { label: "Activity", value: breakdown.transactionActivity, max: 200, score: score }), _jsx(Bar, { label: "Wallet Age", value: breakdown.accountAge, max: 100, score: score }), _jsx(Bar, { label: "PAS Balance", value: breakdown.nativeBalance, max: 150, score: score })] }), _jsxs("div", { className: "space-y-3", children: [_jsx(Bar, { label: "USDT Volume", value: breakdown.usdtHolding, max: 200, score: score }), _jsx(Bar, { label: "USDC Volume", value: breakdown.usdcHolding, max: 150, score: score }), _jsx(Bar, { label: "Complexity", value: breakdown.accountComplexity, max: 200, score: score })] })] })] }), _jsxs("div", { className: "px-5 py-4 bg-black/10", children: [_jsx("div", { className: "text-[8px] font-black uppercase tracking-widest text-gray-700 mb-3", children: "On-Chain Evidence" }), _jsx("div", { className: "grid grid-cols-2 gap-2", children: [
                            { label: 'PAS Balance', dot: pasDotClass, value: pasDisplay },
                            { label: 'USDT', dot: usdtDotClass, value: usdtDisplay },
                            { label: 'USDC', dot: usdcDotClass, value: usdcDisplay },
                            { label: 'Nonce', dot: 'bg-gray-700', value: `#${rawChainData.nonce}` },
                        ].map(({ label, dot, value }) => (_jsxs("div", { className: "bg-polkadot-dark/60 border border-white/5 rounded-xl px-3 py-2.5", children: [_jsx("div", { className: "text-[8px] font-bold uppercase tracking-widest text-gray-700 mb-1", children: label }), _jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("span", { className: `w-1.5 h-1.5 rounded-full shrink-0 ${dot}` }), _jsx("span", { className: "text-[10px] font-mono text-gray-400 truncate", children: value })] })] }, label))) })] })] }));
}
