import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef } from 'react';
import { useAccount, useChainId, useSwitchChain, useConnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { ScoreCard } from '../components/ScoreCard';
import { NFTViewer } from '../components/NFTViewer';
import { HistoryChart } from '../components/HistoryChart';
import { useScore } from '../hooks/useScore';
import { useTotalScored } from '../hooks/useTotalScored';
import { pasTestnet, SCORE_NFT_PROXY } from '../utils/wagmi';
const EXPLORER = 'https://polkadot.testnet.routescan.io';
const STAGES = [
    { key: 'reading', label: 'Chain' },
    { key: 'scoring', label: 'AI' },
    { key: 'signing', label: 'Sign' },
    { key: 'waiting', label: 'MetaMask' },
    { key: 'relay_auth', label: 'Auth' },
    { key: 'relay_submitting', label: 'Relay' },
    { key: 'confirming', label: 'Confirm' },
];
const STAGE_KEYS = STAGES.map(s => s.key);
const FEATURES = [
    { icon: '⛓', title: 'Fully On-Chain', desc: 'Score NFT metadata as on-chain SVG. No IPFS, no external hosting.' },
    { icon: '🤖', title: 'AI Scoring', desc: 'Mistral AI analyses 6 on-chain factors and scores 0–1100.' },
    { icon: '🔒', title: 'Soulbound NFT', desc: 'Non-transferable ERC-721. Valid 2h, refreshable after 5 min.' },
    { icon: '🏦', title: 'DeFi Ready', desc: 'One API call: GET /verify/:address. No oracle, no review.' },
];
const HOW_IT_WORKS = [
    ['01', 'Chain Data', 'Nonce, PAS balance, USDT/USDC, reserved/frozen via Polkadot API'],
    ['02', 'AI Scoring', 'Mistral AI scores 6 factors → 0–1100 with per-category reasoning'],
    ['03', 'EIP-712 Sign', 'Backend signs payload · you verify terms and pay gas in MetaMask'],
    ['04', 'Soulbound NFT', 'On-chain SVG NFT · Valid 2h · Refreshable after 5 min'],
];
function fmt(ts) {
    return new Date(ts * 1000).toLocaleDateString('en-GB', {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    });
}
function formatWait(sec) {
    if (sec <= 0)
        return 'now';
    if (sec < 60)
        return `${sec}s`;
    const m = Math.floor(sec / 60), s = sec % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
}
export function Home({ onNavigate }) {
    const { address, isConnected } = useAccount();
    const [inputAddr, setInputAddr] = useState('');
    const wasManuallyEdited = useRef(false);
    useEffect(() => {
        if (!wasManuallyEdited.current)
            setInputAddr(address ?? '');
    }, [address]);
    const chainId = useChainId();
    const { switchChain } = useSwitchChain();
    const { connect } = useConnect();
    const isWrongNetwork = isConnected && chainId !== pasTestnet.id;
    const isMismatch = isConnected && !!address
        && inputAddr.toLowerCase() !== address.toLowerCase()
        && inputAddr.startsWith('0x') && inputAddr.length === 42;
    const { status, payload, error, cooldownTs, gasEstimate, rateLimitSec, hasCachedPayload, requestScore, retryMint, reset } = useScore();
    const totalScored = useTotalScored();
    const isRateLimitError = !!error && (error.startsWith('rate_limited:') ||
        error.toLowerCase().includes('rate limit') ||
        error.toLowerCase().includes('rate limited') ||
        error.toLowerCase().includes('try again in'));
    const [fullHistory, setFullHistory] = useState([]);
    useEffect(() => {
        if (status !== 'done' || !payload?.wallet)
            return;
        fetch(`/score/${payload.wallet}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data?.history)
            setFullHistory(data.history); })
            .catch(() => { });
    }, [status, payload?.wallet]);
    const prevAddress = useRef(undefined);
    useEffect(() => {
        if (prevAddress.current !== undefined && prevAddress.current !== address) {
            reset();
            setFullHistory([]);
        }
        prevAddress.current = address;
    }, [address]);
    const [now, setNow] = useState(() => Math.floor(Date.now() / 1_000));
    useEffect(() => {
        if (status !== 'cooldown')
            return;
        const id = setInterval(() => setNow(Math.floor(Date.now() / 1_000)), 1_000);
        return () => clearInterval(id);
    }, [status]);
    function liveRemaining(ts) {
        const secs = ts - now;
        if (secs <= 0)
            return 'now';
        const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600);
        const m = Math.floor((secs % 3600) / 60), s = secs % 60;
        if (d > 0)
            return `${d}d ${h}h`;
        if (h > 0)
            return `${h}h ${m}m`;
        if (m > 0)
            return `${m}m ${s}s`;
        return `${s}s`;
    }
    const isLoading = STAGE_KEYS.includes(status);
    const currentStageI = STAGE_KEYS.indexOf(status);
    const currentMintEntry = payload?.txHash ? {
        id: Date.now(), address: payload.wallet, score: payload.score,
        breakdown: JSON.stringify(payload.breakdown), txHash: payload.txHash,
        timestamp: payload.rawChainData.queriedAt,
    } : null;
    const historyForChart = fullHistory.length > 0 ? fullHistory : currentMintEntry ? [currentMintEntry] : [];
    // ─────────────────────────────────────────────────────────────────────────
    // LANDING (not connected)
    // ─────────────────────────────────────────────────────────────────────────
    if (!isConnected) {
        return (_jsxs("div", { className: "flex flex-col min-h-0", children: [_jsxs("section", { className: "relative overflow-hidden border-b border-polkadot-border", children: [_jsx("div", { className: "absolute inset-0 opacity-[0.025]", style: {
                                backgroundImage: 'linear-gradient(#E6007A 1px,transparent 1px),linear-gradient(90deg,#E6007A 1px,transparent 1px)',
                                backgroundSize: '32px 32px',
                            } }), _jsx("div", { className: "absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-polkadot-pink opacity-[0.06] rounded-full blur-3xl pointer-events-none" }), _jsxs("div", { className: "relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 text-center space-y-5", children: [_jsxs("div", { className: "inline-flex items-center gap-1.5 bg-polkadot-pink/10 border border-polkadot-pink/20 rounded-full px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-polkadot-pink", children: [_jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" }), "Paseo Asset Hub \u00B7 Live v2.0"] }), _jsxs("h1", { className: "text-3xl sm:text-4xl font-black tracking-tight text-white leading-tight", children: ["The Protocol for", ' ', _jsx("span", { className: "text-polkadot-pink", children: "On-Chain Credit" })] }), _jsxs("p", { className: "text-gray-500 text-xs sm:text-sm max-w-lg mx-auto leading-relaxed", children: ["VeraScore turns your Substrate wallet history into a verifiable credit profile. Scored ", _jsx("span", { className: "text-gray-300 font-semibold", children: "0\u20131100" }), " by Mistral AI and secured as a soulbound NFT."] }), _jsxs("div", { className: "flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1", children: [_jsx("button", { onClick: () => connect({ connector: injected() }), className: "w-full sm:w-auto bg-polkadot-pink hover:bg-pink-600 text-white font-bold text-xs uppercase tracking-widest px-7 py-3 rounded-xl transition-all shadow-[0_0_16px_rgba(230,0,122,0.3)] hover:shadow-[0_0_24px_rgba(230,0,122,0.5)]", children: "Establish Identity \u2192" }), _jsx("button", { onClick: () => onNavigate('lookup'), className: "w-full sm:w-auto border border-polkadot-border hover:border-gray-500 text-gray-500 hover:text-white font-bold text-xs uppercase tracking-widest px-7 py-3 rounded-xl transition-all", children: "Public Lookup" })] }), _jsx("div", { className: "grid grid-cols-4 gap-2 max-w-sm mx-auto pt-1", children: [['0–1100', 'Score'], ['2 hrs', 'Valid'], ['5 min', 'CD'], ['1 API', 'DeFi']].map(([v, l]) => (_jsxs("div", { className: "bg-white/5 border border-white/5 rounded-xl py-2.5 text-center", children: [_jsx("div", { className: "text-xs font-black text-white font-mono", children: v }), _jsx("div", { className: "text-[8px] font-bold uppercase tracking-wide text-gray-600 mt-0.5", children: l })] }, l))) })] })] }), _jsxs("section", { className: "max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-5", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "h-px flex-1 bg-polkadot-border" }), _jsx("span", { className: "text-[9px] font-bold uppercase tracking-widest text-gray-600", children: "Why VeraScore" }), _jsx("div", { className: "h-px flex-1 bg-polkadot-border" })] }), _jsx("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-3", children: FEATURES.map(({ icon, title, desc }) => (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl p-4 space-y-2 hover:border-polkadot-pink/20 hover:bg-polkadot-pink/[0.03] transition-all group cursor-default", children: [_jsx("div", { className: "text-xl", children: icon }), _jsx("div", { className: "text-xs font-bold text-white group-hover:text-polkadot-pink transition-colors", children: title }), _jsx("div", { className: "text-[10px] text-gray-600 leading-relaxed", children: desc })] }, title))) })] }), _jsx("section", { className: "border-t border-polkadot-border bg-black/10", children: _jsxs("div", { className: "max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "h-px flex-1 bg-polkadot-border" }), _jsx("span", { className: "text-[9px] font-bold uppercase tracking-widest text-gray-600", children: "How It Works" }), _jsx("div", { className: "h-px flex-1 bg-polkadot-border" })] }), _jsx("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-3", children: HOW_IT_WORKS.map(([num, title, desc]) => (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl p-4 space-y-2", children: [_jsx("div", { className: "text-polkadot-pink font-black font-mono text-xl", children: num }), _jsx("div", { className: "text-xs font-bold text-white", children: title }), _jsx("div", { className: "text-[10px] text-gray-600 leading-relaxed", children: desc })] }, num))) }), _jsxs("div", { className: "text-center pt-2 space-y-2", children: [_jsx("button", { onClick: () => connect({ connector: injected() }), className: "bg-polkadot-pink hover:bg-pink-600 text-white font-bold text-xs uppercase tracking-widest px-8 py-3 rounded-xl transition-all shadow-[0_0_16px_rgba(230,0,122,0.25)]", children: "Connect Wallet & Get My Score" }), _jsx("div", { className: "text-[9px] text-gray-700", children: "MetaMask & any injected wallet" })] })] }) }), _jsx("section", { className: "border-t border-polkadot-border", children: _jsx("div", { className: "max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4", children: _jsxs("div", { className: "flex flex-col sm:flex-row items-center justify-between gap-2 text-[9px] text-gray-700", children: [_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" }), "V3 UUPS Proxy \u00B7 On-chain SVG \u00B7 No IPFS"] }), _jsxs("a", { href: `${EXPLORER}/address/${SCORE_NFT_PROXY}`, target: "_blank", rel: "noopener noreferrer", className: "font-mono hover:text-polkadot-pink transition-colors", children: [SCORE_NFT_PROXY, " \u2197"] })] }) }) })] }));
    }
    // ─────────────────────────────────────────────────────────────────────────
    // CONNECTED — score flow
    // ─────────────────────────────────────────────────────────────────────────
    return (_jsxs("div", { className: "max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-xl font-black tracking-tight text-white", children: ["On-Chain ", _jsx("span", { className: "text-polkadot-pink", children: "Credit Score" })] }), _jsx("p", { className: "text-[10px] text-gray-600 mt-0.5 font-medium", children: "AI analyses your wallet \u00B7 Soulbound NFT \u00B7 Paseo Asset Hub" })] }), isWrongNetwork && (_jsxs("div", { className: "flex items-center justify-between bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-4 py-3", children: [_jsx("span", { className: "text-xs font-semibold text-yellow-400", children: "\u26A0 Switch to Polkadot Hub TestNet" }), _jsx("button", { onClick: () => switchChain({ chainId: pasTestnet.id }), className: "ml-3 shrink-0 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 font-bold text-[9px] uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all", children: "Switch" })] })), !isWrongNetwork && status !== 'done' && status !== 'cooldown' && (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsxs("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20 flex items-center justify-between", children: [_jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-gray-500", children: "Wallet to Score" }), totalScored !== null && (_jsxs("span", { className: "text-[9px] text-gray-600 font-mono", children: [totalScored, " scored"] }))] }), _jsxs("div", { className: "px-4 py-4 space-y-3", children: [_jsxs("div", { className: "relative", children: [_jsx("input", { type: "text", value: inputAddr, onChange: e => { wasManuallyEdited.current = true; setInputAddr(e.target.value); }, placeholder: "0x\u2026 paste any wallet address", spellCheck: false, className: "w-full bg-polkadot-dark border border-polkadot-border focus:border-polkadot-pink/40 rounded-xl px-4 py-2.5 text-xs font-mono text-gray-300 placeholder-gray-700 outline-none transition-colors" }), address && inputAddr !== address && (_jsx("button", { onClick: () => { wasManuallyEdited.current = false; setInputAddr(address); }, className: "absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-polkadot-pink hover:opacity-70 bg-polkadot-pink/10 px-2 py-1 rounded-lg transition-all", children: "\u21BA reset" }))] }), isMismatch && (_jsxs("div", { className: "bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2.5 space-y-1.5", children: [_jsx("p", { className: "text-[10px] font-semibold text-amber-400", children: "\u26A0 Address mismatch \u2014 minting will fail" }), _jsxs("p", { className: "text-[9px] text-amber-400/70 leading-relaxed", children: ["MetaMask: ", _jsxs("span", { className: "font-mono", children: [address?.slice(0, 6), "\u2026", address?.slice(-4)] }), ' ', "vs scoring", ' ', _jsxs("span", { className: "font-mono", children: [inputAddr.slice(0, 6), "\u2026", inputAddr.slice(-4)] }), ". Contract requires signer = scored wallet."] }), _jsx("button", { onClick: () => { wasManuallyEdited.current = false; setInputAddr(address); }, className: "text-[9px] font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 px-3 py-1.5 rounded-lg transition-all", children: "\u21BA Use my connected wallet" })] })), _jsx("button", { onClick: () => requestScore(inputAddr), disabled: isLoading || isMismatch || !inputAddr.startsWith('0x') || inputAddr.length !== 42 || isRateLimitError, className: "w-full py-3 bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_12px_rgba(230,0,122,0.2)] hover:shadow-[0_0_18px_rgba(230,0,122,0.35)]", children: isLoading ? (_jsxs("span", { className: "flex items-center justify-center gap-2", children: [_jsxs("svg", { className: "animate-spin h-3.5 w-3.5", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8v8H4z" })] }), status === 'waiting' ? 'Confirm in MetaMask…'
                                                    : status === 'relay_auth' ? 'Sign Auth (free)…'
                                                        : status === 'relay_submitting' ? 'Relaying…'
                                                            : status === 'confirming' ? 'Waiting for block…'
                                                                : 'Processing…'] })) : 'Generate Score' })] })] }), isLoading && (_jsx("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl px-4 py-3", children: _jsx("div", { className: "flex items-center gap-1", children: STAGES.map((stage, i) => {
                                const done = currentStageI > i;
                                const active = currentStageI === i;
                                return (_jsxs("div", { className: "flex items-center flex-1 min-w-0", children: [_jsxs("div", { className: "flex flex-col items-center gap-1 w-full min-w-0", children: [_jsx("div", { className: `w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-all ${done ? 'border-emerald-600 bg-emerald-500/10'
                                                        : active ? 'border-polkadot-pink bg-polkadot-pink/10'
                                                            : 'border-white/8 bg-transparent'}`, children: done ? (_jsx("svg", { className: "h-3 w-3 text-emerald-400", fill: "currentColor", viewBox: "0 0 20 20", children: _jsx("path", { fillRule: "evenodd", d: "M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z", clipRule: "evenodd" }) })) : active ? (_jsxs("svg", { className: "animate-spin h-3 w-3 text-polkadot-pink", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8v8H4z" })] })) : (_jsx("div", { className: "w-1 h-1 rounded-full bg-white/10" })) }), _jsx("span", { className: `text-[7px] font-bold uppercase tracking-wide truncate w-full text-center hidden sm:block ${done ? 'text-emerald-500' : active ? 'text-polkadot-pink' : 'text-gray-700'}`, children: stage.label })] }), i < STAGES.length - 1 && (_jsx("div", { className: `h-px w-full mb-4 sm:mb-4 transition-colors ${done ? 'bg-emerald-800' : 'bg-white/5'}` }))] }, stage.key));
                            }) }) })), status === 'waiting' && (_jsxs("div", { className: "bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3 space-y-1", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "w-2.5 h-2.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" }), _jsx("span", { className: "text-xs font-semibold text-amber-400", children: "Check MetaMask \u2014 confirm to mint" })] }), gasEstimate ? (_jsxs("p", { className: "text-[9px] text-amber-600 font-mono pl-4.5", children: ["Fee: ", _jsxs("span", { className: "text-amber-400", children: [gasEstimate.pas, " PAS"] }), _jsxs("span", { className: "ml-1", children: ["(~$", gasEstimate.usd, ")"] })] })) : (_jsx("p", { className: "text-[9px] text-amber-700 pl-4.5", children: "Calculating fee\u2026" }))] })), status === 'relay_auth' && (_jsxs("div", { className: "flex items-center gap-2 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3", children: [_jsx("span", { className: "w-2.5 h-2.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" }), _jsx("span", { className: "text-xs font-semibold text-blue-400", children: "Check MetaMask \u2014 sign free authorization" })] })), status === 'relay_submitting' && (_jsxs("div", { className: "flex items-center gap-2 bg-polkadot-pink/5 border border-polkadot-pink/15 rounded-xl px-4 py-3", children: [_jsx("span", { className: "w-2.5 h-2.5 border-2 border-polkadot-pink border-t-transparent rounded-full animate-spin shrink-0" }), _jsx("span", { className: "text-xs font-semibold text-polkadot-pink", children: "Backend minting on-chain \u2014 gasless relay" })] })), status === 'idle' && (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsx("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20", children: _jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-gray-500", children: "How it works" }) }), _jsx("div", { className: "px-4 py-3 space-y-3", children: HOW_IT_WORKS.map(([num, title, desc]) => (_jsxs("div", { className: "flex gap-3", children: [_jsx("span", { className: "text-polkadot-pink font-black font-mono text-xs w-6 shrink-0 mt-0.5", children: num }), _jsxs("div", { children: [_jsxs("span", { className: "text-xs font-semibold text-white", children: [title, " \u2014 "] }), _jsx("span", { className: "text-xs text-gray-500", children: desc })] })] }, num))) })] }))] })), status === 'error' && isRateLimitError && (_jsxs("div", { className: "bg-polkadot-card border border-orange-500/20 rounded-2xl p-6 text-center space-y-4", children: [_jsx("div", { className: "text-3xl", children: "\u23F3" }), _jsxs("div", { children: [_jsx("div", { className: "text-sm font-bold text-white", children: "Too Many Attempts" }), _jsx("div", { className: "text-[10px] text-gray-600 mt-0.5", children: "Please wait before requesting another score." })] }), _jsxs("div", { className: "bg-orange-500/5 border border-orange-500/20 rounded-xl px-5 py-3 inline-block", children: [_jsx("div", { className: "text-[8px] font-bold uppercase tracking-widest text-orange-500 mb-0.5", children: "Try again in" }), _jsx("div", { className: "font-mono font-black text-orange-300 text-3xl tracking-tight", children: rateLimitSec !== null && rateLimitSec > 0 ? formatWait(rateLimitSec) : 'now' })] }), _jsx("div", { children: _jsx("button", { onClick: reset, className: "text-[9px] text-gray-600 hover:text-gray-400 underline transition-colors", children: "Dismiss" }) })] })), status === 'error' && error === 'retry_available' && (_jsxs("div", { className: "bg-polkadot-card border border-yellow-500/20 rounded-2xl p-5 text-center space-y-3", children: [_jsx("div", { className: "text-2xl", children: "\u26A1" }), _jsxs("div", { children: [_jsx("div", { className: "text-sm font-bold text-white", children: "Score Ready \u2014 Mint Pending" }), _jsx("div", { className: "text-[10px] text-gray-600 mt-0.5", children: "Score generated but mint didn't complete." })] }), _jsx("button", { onClick: () => retryMint(), className: "w-full py-3 bg-polkadot-pink hover:bg-pink-600 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_12px_rgba(230,0,122,0.2)]", children: "\u21BB Reopen MetaMask \u2014 Finish Minting" }), _jsx("button", { onClick: reset, className: "text-[9px] text-gray-600 hover:text-gray-400 underline transition-colors", children: "Start over" })] })), status === 'error' && error && !isRateLimitError && error !== 'retry_available' && (_jsxs("div", { className: "bg-red-500/5 border border-red-500/20 rounded-2xl p-4 space-y-3", children: [_jsxs("div", { className: "flex items-start gap-2.5", children: [_jsx("span", { className: "text-red-400 shrink-0 mt-0.5", children: "\u26A0" }), _jsxs("div", { children: [_jsx("div", { className: "text-xs font-semibold text-red-400", children: "Something went wrong" }), _jsx("div", { className: "text-[10px] text-red-400/60 mt-0.5 leading-relaxed", children: error })] })] }), hasCachedPayload ? (_jsxs("div", { className: "space-y-1.5", children: [_jsx("button", { onClick: () => retryMint(), className: "w-full py-2.5 bg-polkadot-pink hover:bg-pink-600 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all", children: "\u21BB Retry mint" }), _jsx("button", { onClick: reset, className: "w-full py-2 bg-red-500/5 border border-red-500/20 text-red-400 font-bold text-[9px] uppercase tracking-widest rounded-xl transition-all", children: "Start over" })] })) : (_jsx("button", { onClick: reset, className: "w-full py-2 bg-red-500/5 border border-red-500/20 text-red-400 font-bold text-[9px] uppercase tracking-widest rounded-xl transition-all", children: "Try again" }))] })), status === 'cooldown' && (_jsxs("div", { className: "bg-polkadot-card border border-yellow-500/20 rounded-2xl p-6 text-center space-y-4", children: [_jsx("div", { className: "text-3xl", children: "\uD83D\uDD12" }), _jsxs("div", { children: [_jsx("div", { className: "text-sm font-bold text-white", children: "Score Already Valid" }), _jsx("div", { className: "text-[10px] text-gray-600 mt-0.5", children: "Your VeraScore NFT is active. Refresh after cooldown." })] }), cooldownTs && cooldownTs > 0 ? (_jsxs("div", { className: "bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-5 py-3 inline-block", children: [_jsx("div", { className: "text-[8px] font-bold uppercase tracking-widest text-yellow-500 mb-0.5", children: "Refresh available" }), _jsx("div", { className: "font-mono font-black text-yellow-300 text-2xl tracking-tight", children: liveRemaining(cooldownTs) }), _jsx("div", { className: "text-[9px] text-yellow-700 mt-0.5", children: fmt(cooldownTs) })] })) : (_jsx("div", { className: "bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-5 py-2 inline-block", children: _jsx("div", { className: "text-xs font-semibold text-emerald-400", children: "\u2713 Refresh available now" }) })), _jsxs("div", { className: "text-[10px] text-gray-600", children: ["View score in", ' ', _jsx("button", { onClick: () => onNavigate('lookup'), className: "text-polkadot-pink hover:opacity-70 transition-opacity", children: "Lookup" }), "."] }), _jsx("button", { onClick: reset, className: "w-full py-2.5 border border-polkadot-border hover:border-gray-500 text-gray-500 hover:text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all", children: "Back" })] })), payload && status === 'done' && (_jsxs("div", { className: "space-y-4", children: [_jsx("div", { className: `rounded-xl px-4 py-3 text-xs font-semibold text-center ${payload.alreadyHadScore
                            ? 'bg-blue-500/5 border border-blue-500/20 text-blue-400'
                            : 'bg-emerald-500/5 border border-emerald-500/20 text-emerald-400'}`, children: payload.alreadyHadScore
                            ? '✓ Score updated — soulbound NFT refreshed on-chain'
                            : '✓ Soulbound Score NFT minted to your wallet' }), _jsx(ScoreCard, { payload: payload, expiresAt: payload.expiresAt }), payload.wallet && payload.score > 0 && (_jsx(NFTViewer, { wallet: payload.wallet, proxyAddress: SCORE_NFT_PROXY, label: "Your Score NFT", initialDelay: payload.txHash ? 3000 : 500 })), historyForChart.length > 0 && _jsx(HistoryChart, { history: historyForChart }), payload.relayed && (_jsx("div", { className: "bg-polkadot-pink/5 border border-polkadot-pink/15 rounded-xl px-4 py-2.5 text-[10px] font-semibold text-polkadot-pink text-center", children: "\u2705 Minted via gasless relay \u2014 paid with USDT, zero PAS required" })), payload.txHash && (_jsxs("div", { className: "flex items-center justify-center gap-4", children: [_jsx("a", { href: `${EXPLORER}/tx/${payload.txHash}`, target: "_blank", rel: "noopener noreferrer", className: "text-[9px] font-bold text-polkadot-pink hover:opacity-70 transition-opacity uppercase tracking-widest", children: "View Mint Tx \u2197" }), _jsx("span", { className: "text-gray-800", children: "\u00B7" }), _jsx("a", { href: `${EXPLORER}/address/${SCORE_NFT_PROXY}`, target: "_blank", rel: "noopener noreferrer", className: "text-[9px] font-bold text-gray-600 hover:text-polkadot-pink transition-colors uppercase tracking-widest", children: "Contract \u2197" })] })), _jsx("button", { onClick: () => { reset(); setFullHistory([]); }, className: "w-full py-2.5 border border-polkadot-border hover:border-gray-500 text-gray-500 hover:text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all", children: "Score Again" })] }))] }));
}
