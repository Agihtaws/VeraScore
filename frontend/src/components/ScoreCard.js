import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useBalance } from 'wagmi';
import { pasTestnet, USDT_ERC20, USDC_ERC20, STABLECOIN_DECIMALS } from '../utils/wagmi.js';
function scoreColor(score) {
    if (score >= 750)
        return 'text-green-400';
    if (score >= 500)
        return 'text-yellow-400';
    if (score >= 250)
        return 'text-orange-400';
    return 'text-red-400';
}
function scoreBg(score) {
    if (score >= 750)
        return 'bg-green-400';
    if (score >= 500)
        return 'bg-yellow-400';
    if (score >= 250)
        return 'bg-orange-400';
    return 'bg-red-400';
}
function scoreLabel(score) {
    if (score >= 750)
        return 'Excellent';
    if (score >= 500)
        return 'Good';
    if (score >= 250)
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
    return new Date(ts * 1000).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
}
function Bar({ label, value, max, score }) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return (_jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "flex justify-between text-xs", children: [_jsx("span", { className: "text-gray-400", children: label }), _jsxs("span", { className: "text-white font-mono", children: [value, _jsxs("span", { className: "text-gray-600", children: ["/", max] })] })] }), _jsx("div", { className: "h-1.5 bg-polkadot-border rounded-full overflow-hidden", children: _jsx("div", { className: `h-full rounded-full transition-all duration-700 ${scoreBg(score)}`, style: { width: `${pct}%` } }) })] }));
}
export function ScoreCard({ payload, expiresAt }) {
    const { score, reasoning, breakdown, rawChainData, alreadyHadScore } = payload;
    const expiry = expiresAt ?? Math.floor(rawChainData.queriedAt / 1000) + 30 * 24 * 3600;
    const isValid = Math.floor(Date.now() / 1000) <= expiry;
    // Live PAS balance — polls every 10s so the card stays fresh after swaps/transfers
    const { data: liveBalance, isLoading: pasLoading, isError: pasError, } = useBalance({
        address: rawChainData.address,
        chainId: pasTestnet.id,
        query: {
            refetchInterval: 10_000,
            staleTime: 10_000,
            retry: 2,
        },
    });
    // Live USDT balance via ERC-20 precompile (Substrate asset ID 1984)
    const { data: liveUSDT, isLoading: usdtLoading, isError: usdtError, } = useBalance({
        address: rawChainData.address,
        token: USDT_ERC20,
        chainId: pasTestnet.id,
        query: {
            refetchInterval: 10_000,
            staleTime: 10_000,
            retry: 2,
        },
    });
    // Live USDC balance via ERC-20 precompile (Substrate asset ID 1337)
    // NOTE: USDC (asset 1337) is not deployed on PAS TestNet — precompile returns 0.
    // retry:0 + no refetch interval stops it from hammering the RPC every 10s.
    const { data: liveUSDC, isLoading: usdcLoading, isError: usdcError, } = useBalance({
        address: rawChainData.address,
        token: USDC_ERC20,
        chainId: pasTestnet.id,
        query: {
            refetchInterval: false,
            staleTime: Infinity,
            retry: 0,
        },
    });
    // ── Formatters ─────────────────────────────────────────────────────────────
    /** Format a stablecoin bigint (6 decimals) to a human-readable string */
    function formatStable(value, symbol) {
        const units = 10n ** BigInt(STABLECOIN_DECIMALS);
        const whole = value / units;
        const frac = value % units;
        const fracStr = frac.toString().padStart(STABLECOIN_DECIMALS, '0').replace(/0+$/, '');
        return fracStr.length > 0
            ? `${whole.toLocaleString()}.${fracStr} ${symbol}`
            : `${whole.toLocaleString()} ${symbol}`;
    }
    /** Format a stablecoin raw string (6 decimals, from PAPI) to human-readable */
    function formatStableRaw(raw, symbol) {
        try {
            const v = BigInt(raw);
            if (v === 0n)
                return '—';
            return formatStable(v, symbol);
        }
        catch {
            return raw;
        }
    }
    // Resolved display values:
    // - loading → show PAPI snapshot (skeleton dot)
    // - error   → show PAPI snapshot (no dot, silent fallback)
    // - data    → show live value (green dot)
    const usdtDisplay = liveUSDT
        ? (liveUSDT.value === 0n ? '—' : formatStable(liveUSDT.value, 'USDT'))
        : formatStableRaw(rawChainData.usdtBalance, 'USDT');
    const usdcDisplay = liveUSDC
        ? (liveUSDC.value === 0n ? '—' : formatStable(liveUSDC.value, 'USDC'))
        : formatStableRaw(rawChainData.usdcBalance, 'USDC');
    const pasDisplay = liveBalance
        ? `${Number(liveBalance.value) / 1e18 < 0.001
            ? '<0.001'
            : (Number(liveBalance.value) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 })} PAS`
        : formatPAS(rawChainData.freeBalance);
    // Dot states:
    // Dot only shows when confirmed live balance > 0 — no amber flash during load
    const pasDotClass = liveBalance && liveBalance.value > 0n ? 'bg-green-500 animate-pulse' : null;
    const usdtDotClass = liveUSDT && liveUSDT.value > 0n ? 'bg-green-500 animate-pulse' : null;
    const usdcDotClass = liveUSDC && liveUSDC.value > 0n ? 'bg-green-500 animate-pulse' : null;
    return (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden w-full", children: [_jsxs("div", { className: "px-6 pt-8 pb-5 border-b border-polkadot-border text-center space-y-3", children: [_jsx("div", { className: `text-8xl font-bold font-mono leading-none ${scoreColor(score)}`, children: score }), _jsx("div", { className: "text-gray-500 text-xs", children: "out of 1000" }), _jsx("div", { className: "max-w-xs mx-auto space-y-1", children: _jsx("div", { className: "h-2 bg-polkadot-border rounded-full overflow-hidden", children: _jsx("div", { className: `h-full rounded-full transition-all duration-1000 ${scoreBg(score)}`, style: { width: `${(score / 1000) * 100}%` } }) }) }), _jsxs("div", { className: "flex items-center justify-center gap-2 flex-wrap", children: [_jsx("span", { className: `text-xs font-semibold px-3 py-1 rounded-full border ${score >= 750 ? 'border-green-800  text-green-400  bg-green-950' :
                                    score >= 500 ? 'border-yellow-800 text-yellow-400 bg-yellow-950' :
                                        score >= 250 ? 'border-orange-800 text-orange-400 bg-orange-950' :
                                            'border-red-800    text-red-400    bg-red-950'}`, children: scoreLabel(score) }), isValid ? (_jsx("span", { className: "text-xs font-semibold px-3 py-1 rounded-full border border-green-800 text-green-400 bg-green-950", children: "\u2713 Valid" })) : (_jsx("span", { className: "text-xs font-semibold px-3 py-1 rounded-full border border-red-800 text-red-400 bg-red-950", children: "Expired" })), alreadyHadScore && (_jsx("span", { className: "text-xs font-semibold px-3 py-1 rounded-full border border-blue-800 text-blue-400 bg-blue-950", children: "Refreshed" })), rawChainData.hasForeignAssets && (_jsx("span", { className: "text-xs font-semibold px-3 py-1 rounded-full border border-purple-800 text-purple-400 bg-purple-950", children: "\u2726 Cross-Chain" }))] }), _jsx("div", { className: "text-xs text-gray-500", children: isValid
                            ? `Valid until ${fmt(expiry)}`
                            : `Expired on ${fmt(expiry)} — refresh to renew` })] }), _jsxs("div", { className: "px-6 py-4 border-b border-polkadot-border", children: [_jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest mb-2", children: "AI Reasoning" }), _jsx("p", { className: "text-gray-300 text-sm leading-relaxed", children: reasoning })] }), _jsxs("div", { className: "px-6 py-5 border-b border-polkadot-border space-y-4", children: [_jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "Score Breakdown" }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4", children: [_jsxs("div", { className: "space-y-4", children: [_jsx(Bar, { label: "Transaction Activity", value: breakdown.transactionActivity, max: 200, score: score }), _jsx(Bar, { label: "Account Age", value: breakdown.accountAge, max: 100, score: score }), _jsx(Bar, { label: "Native PAS Balance", value: breakdown.nativeBalance, max: 150, score: score })] }), _jsxs("div", { className: "space-y-4", children: [_jsx(Bar, { label: "USDT Holding", value: breakdown.usdtHolding, max: 200, score: score }), _jsx(Bar, { label: "USDC Holding", value: breakdown.usdcHolding, max: 150, score: score }), _jsx(Bar, { label: "Account Complexity", value: breakdown.accountComplexity, max: 200, score: score }), _jsx(Bar, { label: "Runtime Modernity", value: breakdown.runtimeModernity ?? 0, max: 100, score: score })] })] })] }), _jsxs("div", { className: "px-6 py-4", children: [_jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest mb-3", children: "Chain Data" }), _jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs", children: [_jsxs("div", { className: "bg-polkadot-dark rounded-lg px-3 py-2 space-y-0.5", children: [_jsx("div", { className: "text-gray-600 text-[10px] uppercase tracking-wider", children: "PAS Balance" }), _jsxs("div", { className: "text-gray-300 font-mono text-xs truncate flex items-center gap-1.5", children: [pasDisplay, pasDotClass && (_jsx("span", { title: pasLoading ? 'Fetching live balance…' : 'Live balance from chain', className: `inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${pasDotClass}` }))] })] }), [
                                ['Transactions', rawChainData.nonce.toString()],
                                ['Metadata Versions', rawChainData.metadataVersions.join(', ')],
                                ['WETH (Bridged)', rawChainData.wethBalance === '0' ? '—' : rawChainData.wethBalance],
                                ['Cross-Chain', rawChainData.hasForeignAssets ? '✦ Active' : '—'],
                                ['Status', alreadyHadScore ? 'Refreshed' : 'First mint'],
                            ].map(([label, value]) => (_jsxs("div", { className: "bg-polkadot-dark rounded-lg px-3 py-2 space-y-0.5", children: [_jsx("div", { className: "text-gray-600 text-[10px] uppercase tracking-wider", children: label }), _jsx("div", { className: "text-gray-300 font-mono text-xs truncate", children: value })] }, label))), _jsxs("div", { className: "bg-polkadot-dark rounded-lg px-3 py-2 space-y-0.5", children: [_jsx("div", { className: "text-gray-600 text-[10px] uppercase tracking-wider", children: "USDT" }), _jsxs("div", { className: "text-gray-300 font-mono text-xs truncate flex items-center gap-1.5", children: [usdtDisplay, usdtDotClass && (_jsx("span", { title: usdtLoading ? 'Fetching live USDT balance…' : 'Live USDT from ERC-20 precompile', className: `inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${usdtDotClass}` }))] })] }), _jsxs("div", { className: "bg-polkadot-dark rounded-lg px-3 py-2 space-y-0.5", children: [_jsx("div", { className: "text-gray-600 text-[10px] uppercase tracking-wider", children: "USDC" }), _jsxs("div", { className: "text-gray-300 font-mono text-xs truncate flex items-center gap-1.5", children: [usdcDisplay, usdcDotClass && (_jsx("span", { title: usdcLoading ? 'Fetching live USDC balance…' : 'Live USDC from ERC-20 precompile', className: `inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${usdcDotClass}` }))] })] })] })] })] }));
}
