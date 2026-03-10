import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef } from 'react';
import { useAccount, useChainId, useSwitchChain, useConnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { ScoreCard } from '../components/ScoreCard.js';
import { NFTViewer } from '../components/NFTViewer.js';
import { HistoryChart } from '../components/HistoryChart.js';
import { useScore } from '../hooks/useScore.js';
import { useTotalScored } from '../hooks/useTotalScored.js';
import { pasTestnet, SCORE_NFT_PROXY } from '../utils/wagmi.js';
const EXPLORER = 'https://polkadot.testnet.routescan.io';
const STAGES = [
    { key: 'reading', label: 'Chain read' },
    { key: 'scoring', label: 'AI Scoring' },
    { key: 'signing', label: 'Sign tx' },
    { key: 'waiting', label: 'MetaMask' },
    { key: 'relay_auth', label: 'Authorize' },
    { key: 'relay_submitting', label: 'Relaying' },
    { key: 'confirming', label: 'Confirming' },
];
const STAGE_KEYS = STAGES.map(s => s.key);
const FEATURES = [
    {
        icon: '⛓',
        title: 'Fully On-Chain',
        desc: 'Score NFT metadata is generated entirely on-chain as an SVG. No IPFS, no external hosting — nothing that can go down.',
    },
    {
        icon: '🤖',
        title: 'AI Scoring',
        desc: 'Mistral AI analyses 6 on-chain factors — transactions, balance, stablecoin holdings, account age — and scores 0–1000.',
    },
    {
        icon: '🔒',
        title: 'Soulbound NFT',
        desc: 'Non-transferable ERC-721. Valid 2 hours, refreshable after 5 minutes. Your score is your own — it cannot be sold or transferred.',
    },
    {
        icon: '🏦',
        title: 'DeFi Ready',
        desc: 'Any protocol calls GET /verify/:address to read your score in one request. No oracle dependency. No manual review.',
    },
];
const HOW_IT_WORKS = [
    ['01', 'Chain data', 'Nonce, PAS balance, USDT/USDC, reserved/frozen — all read directly from PAS TestNet via Polkadot API'],
    ['02', 'AI scoring', 'Mistral AI scores 6 on-chain factors and produces a 0–1000 score with full per-category reasoning'],
    ['03', 'EIP-712 sign', 'Backend signs the payload cryptographically — you verify the terms and pay gas in MetaMask'],
    ['04', 'Soulbound NFT', 'Score minted as non-transferable NFT with on-chain SVG · Valid 2 hours · Refreshable after 5 minutes'],
];
function fmt(ts) {
    return new Date(ts * 1000).toLocaleDateString('en-GB', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    });
}
// Format seconds into readable wait time
function formatWait(sec) {
    if (sec <= 0)
        return 'now';
    if (sec < 60)
        return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
}
export function Home({ onNavigate }) {
    const { address, isConnected } = useAccount();
    const [inputAddr, setInputAddr] = useState('');
    // Sync inputAddr with connected wallet (only when not manually edited)
    const wasManuallyEdited = useRef(false);
    useEffect(() => {
        if (!wasManuallyEdited.current) {
            setInputAddr(address ?? '');
        }
    }, [address]);
    const chainId = useChainId();
    const { switchChain } = useSwitchChain();
    const { connect } = useConnect();
    const isWrongNetwork = isConnected && chainId !== pasTestnet.id;
    const isMismatch = isConnected && !!address && inputAddr.toLowerCase() !== address.toLowerCase() && inputAddr.startsWith('0x') && inputAddr.length === 42;
    const { status, payload, error, cooldownTs, gasEstimate, rateLimitSec, hasCachedPayload, requestScore, retryMint, reset } = useScore();
    const totalScored = useTotalScored();
    // ── Rate limit helpers (computed, not inside JSX) ─────────────────────────
    const isRateLimitError = !!error && (error.startsWith('rate_limited:') ||
        error.toLowerCase().includes('rate limit') ||
        error.toLowerCase().includes('rate limited') ||
        error.toLowerCase().includes('try again in'));
    const rateLimitDisplaySec = (() => {
        if (rateLimitSec !== null && rateLimitSec > 0)
            return rateLimitSec;
        if (!isRateLimitError || !error)
            return null;
        const hourM = error.match(/([0-9]+)\s*hour/i);
        const minM = error.match(/([0-9]+)\s*min/i);
        if (hourM)
            return parseInt(hourM[1]) * 3600;
        if (minM)
            return parseInt(minM[1]) * 60;
        return 3600;
    })();
    // ── Full score history (fetched after mint) ────────────────────────────────
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
    // ── Reset everything when wallet changes or disconnects ───────────────────
    const prevAddress = useRef(undefined);
    useEffect(() => {
        if (prevAddress.current !== undefined && prevAddress.current !== address) {
            reset();
            setFullHistory([]);
        }
        prevAddress.current = address;
    }, [address]);
    // ── Live countdown for cooldown timer ──────────────────────────────────────
    const [now, setNow] = useState(() => Math.floor(Date.now() / 1_000));
    useEffect(() => {
        if (status !== 'cooldown')
            return;
        const id = setInterval(() => setNow(Math.floor(Date.now() / 1_000)), 1_000);
        return () => clearInterval(id);
    }, [status]);
    // ── Elapsed timer shown while AI is scoring (the slow step) ───────────────
    const [scoringStart, setScoringStart] = useState(null);
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        if (status === 'scoring') {
            setScoringStart(Date.now());
            setElapsed(0);
        }
        else
            setScoringStart(null);
    }, [status]);
    useEffect(() => {
        if (!scoringStart)
            return;
        const id = setInterval(() => setElapsed(Math.floor((Date.now() - scoringStart) / 1_000)), 1_000);
        return () => clearInterval(id);
    }, [scoringStart]);
    function liveRemaining(ts) {
        const secs = ts - now;
        if (secs <= 0)
            return 'now';
        const d = Math.floor(secs / 86400);
        const h = Math.floor((secs % 86400) / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        if (d > 0)
            return `${d}d ${h}h ${m}m ${s}s`;
        if (h > 0)
            return `${h}h ${m}m ${s}s`;
        if (m > 0)
            return `${m}m ${s}s`;
        return `${s}s`;
    }
    const isLoading = STAGE_KEYS.includes(status);
    const currentStageI = STAGE_KEYS.indexOf(status);
    // Use full fetched history; fall back to current mint only while fetch is in flight
    const currentMintEntry = payload?.txHash ? {
        id: Date.now(),
        address: payload.wallet,
        score: payload.score,
        breakdown: JSON.stringify(payload.breakdown),
        txHash: payload.txHash,
        timestamp: payload.rawChainData.queriedAt,
    } : null;
    const historyForChart = fullHistory.length > 0 ? fullHistory :
        currentMintEntry ? [currentMintEntry] : [];
    // ── LANDING PAGE (not connected) ──────────────────────────────────────────
    if (!isConnected) {
        return (_jsxs("div", { className: "flex flex-col", children: [_jsxs("section", { className: "relative overflow-hidden border-b border-polkadot-border", children: [_jsx("div", { className: "absolute inset-0 opacity-[0.03]", style: {
                                backgroundImage: 'linear-gradient(#E6007A 1px, transparent 1px), linear-gradient(90deg, #E6007A 1px, transparent 1px)',
                                backgroundSize: '40px 40px',
                            } }), _jsx("div", { className: "absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-polkadot-pink opacity-[0.06] rounded-full blur-3xl pointer-events-none" }), _jsxs("div", { className: "relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-14 sm:py-20 text-center space-y-6", children: [_jsxs("div", { className: "inline-flex items-center gap-2 bg-polkadot-card border border-polkadot-border rounded-full px-4 py-1.5 text-[10px] text-gray-400 uppercase tracking-widest font-bold", children: [_jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" }), "Paseo Asset Hub \u00B7 Live v2.0"] }), _jsxs("h1", { className: "text-4xl sm:text-5xl font-bold leading-tight tracking-tight", children: ["The Protocol for", _jsx("br", {}), _jsx("span", { className: "text-polkadot-pink", children: "On-Chain Credit" })] }), _jsxs("p", { className: "text-gray-400 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto", children: ["VeraScore transforms your Substrate history into a verifiable credit profile. Scored ", _jsx("strong", { className: "text-white", children: "0\u20131100" }), " by Mistral AI and secured as a native Soulbound NFT."] }), _jsxs("div", { className: "flex flex-col sm:flex-row items-center justify-center gap-3 pt-2", children: [_jsx("button", { onClick: () => connect({ connector: injected() }), className: "w-full sm:w-auto bg-polkadot-pink hover:bg-pink-600 text-white font-bold px-8 py-3 rounded-xl transition-colors text-sm uppercase tracking-widest", children: "Establish Identity \u2192" }), _jsx("button", { onClick: () => onNavigate('lookup'), className: "w-full sm:w-auto border border-polkadot-border hover:border-gray-500 text-gray-300 hover:text-white font-medium px-8 py-3 rounded-xl transition-colors text-sm", children: "Public Lookup" })] }), _jsx("div", { className: "flex flex-wrap items-center justify-center gap-8 pt-2", children: [
                                        ['0–1100', 'Score range'],
                                        ['2 hrs', 'NFT validity'],
                                        ['5 min', 'Refresh cooldown'],
                                        ['1 API call', 'DeFi integration'],
                                    ].map(([val, label]) => (_jsxs("div", { className: "text-center", children: [_jsx("div", { className: "text-white font-semibold text-base", children: val }), _jsx("div", { className: "text-gray-600 text-[10px] uppercase tracking-wide", children: label })] }, label))) })] })] }), _jsxs("section", { className: "max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-10 sm:py-14 w-full", children: [_jsxs("div", { className: "text-center space-y-1 mb-8", children: [_jsx("h2", { className: "text-xl sm:text-2xl font-bold", children: "Why VeraScore" }), _jsx("p", { className: "text-gray-500 text-xs", children: "Built on Polkadot Hub \u00B7 Powered by Mistral AI" })] }), _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3", children: FEATURES.map(({ icon, title, desc }) => (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-xl p-4 space-y-2 hover:border-gray-600 transition-colors", children: [_jsx("div", { className: "text-2xl", children: icon }), _jsx("div", { className: "font-semibold text-white text-sm", children: title }), _jsx("div", { className: "text-gray-500 text-xs leading-relaxed", children: desc })] }, title))) })] }), _jsx("section", { className: "border-t border-polkadot-border bg-polkadot-card/30", children: _jsxs("div", { className: "max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-10 sm:py-14", children: [_jsxs("div", { className: "text-center space-y-1 mb-8", children: [_jsx("h2", { className: "text-xl sm:text-2xl font-bold", children: "How it works" }), _jsx("p", { className: "text-gray-500 text-xs", children: "Four steps from wallet to verified on-chain credential" })] }), _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4", children: HOW_IT_WORKS.map(([num, title, desc]) => (_jsxs("div", { className: "relative space-y-2", children: [_jsx("div", { className: "text-polkadot-pink font-mono font-bold text-2xl", children: num }), _jsx("div", { className: "font-semibold text-white text-sm", children: title }), _jsx("div", { className: "text-gray-500 text-xs leading-relaxed", children: desc })] }, num))) }), _jsxs("div", { className: "text-center mt-14", children: [_jsx("button", { onClick: () => connect({ connector: injected() }), className: "bg-polkadot-pink hover:bg-pink-600 text-white font-semibold px-10 py-3.5 rounded-xl transition-colors text-base", children: "Connect Wallet & Get My Score" }), _jsx("div", { className: "mt-3 text-gray-600 text-xs", children: "Supports MetaMask, WalletConnect, and any injected wallet" })] })] }) }), _jsx("section", { className: "border-t border-polkadot-border", children: _jsx("div", { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-8", children: _jsxs("div", { className: "flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-600", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "w-2 h-2 rounded-full bg-green-500 shrink-0" }), _jsx("span", { children: "V3 UUPS Proxy \u00B7 On-chain SVG metadata \u00B7 No IPFS" })] }), _jsxs("a", { href: `${EXPLORER}/address/${SCORE_NFT_PROXY}`, target: "_blank", rel: "noopener noreferrer", className: "font-mono text-gray-500 hover:text-polkadot-pink transition-colors", children: [SCORE_NFT_PROXY, " \u2197"] })] }) }) })] }));
    }
    // ── CONNECTED — score flow ────────────────────────────────────────────────
    return (_jsx("div", { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-10", children: _jsxs("div", { className: "max-w-2xl mx-auto space-y-6", children: [isWrongNetwork && (_jsxs("div", { className: "bg-yellow-950 border border-yellow-800 rounded-xl px-4 py-3 flex items-center justify-between text-sm", children: [_jsx("span", { className: "text-yellow-300", children: "Switch to Polkadot Hub TestNet to continue" }), _jsx("button", { onClick: () => switchChain({ chainId: pasTestnet.id }), className: "text-xs bg-yellow-500 hover:bg-yellow-400 text-black px-3 py-1.5 rounded-lg font-medium transition-colors ml-3 shrink-0", children: "Switch" })] })), !isWrongNetwork && status !== 'done' && status !== 'cooldown' && (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "text-center space-y-1 pb-2", children: [_jsxs("h1", { className: "text-2xl font-bold", children: ["Your On-Chain ", _jsx("span", { className: "text-polkadot-pink", children: "Credit Score" })] }), _jsx("p", { className: "text-gray-500 text-sm", children: "AI analyses your wallet history and mints a permanent soulbound NFT credential." })] }), _jsxs("div", { className: "relative", children: [_jsx("input", { type: "text", value: inputAddr, onChange: e => { wasManuallyEdited.current = true; setInputAddr(e.target.value); }, placeholder: "0x\u2026 paste any wallet address", spellCheck: false, className: "w-full bg-polkadot-card border border-polkadot-border focus:border-polkadot-pink/60 rounded-xl px-4 py-3 text-sm font-mono text-gray-300 placeholder-gray-600 outline-none transition-colors break-all" }), address && inputAddr !== address && (_jsx("button", { onClick: () => { wasManuallyEdited.current = false; setInputAddr(address); }, className: "absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-polkadot-pink hover:text-white bg-polkadot-pink/10 hover:bg-polkadot-pink/20 px-2 py-1 rounded-md transition-all", children: "\u21BA reset" }))] }), isMismatch && (_jsxs("div", { className: "flex items-start gap-3 bg-amber-950/60 border border-amber-500/40 rounded-xl px-4 py-3", children: [_jsx("span", { className: "text-amber-400 text-base shrink-0 mt-0.5", children: "\u26A0" }), _jsxs("div", { className: "space-y-1.5", children: [_jsx("p", { className: "text-amber-300 text-sm font-medium", children: "Address mismatch \u2014 minting will fail" }), _jsxs("p", { className: "text-amber-300/70 text-xs leading-relaxed", children: ["MetaMask is connected as ", _jsxs("span", { className: "font-mono", children: [address?.slice(0, 6), "\u2026", address?.slice(-4)] }), " but you're scoring ", _jsxs("span", { className: "font-mono", children: [inputAddr.slice(0, 6), "\u2026", inputAddr.slice(-4)] }), ". The contract requires the signer to be the wallet being scored."] }), _jsx("div", { className: "flex gap-2 pt-0.5", children: _jsx("button", { onClick: () => { wasManuallyEdited.current = false; setInputAddr(address); }, className: "text-xs bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 px-3 py-1.5 rounded-lg transition-all", children: "\u21BA Score my connected wallet" }) })] })] })), _jsx("button", { onClick: () => requestScore(inputAddr), disabled: isLoading || isMismatch || !inputAddr.startsWith('0x') || inputAddr.length !== 42 || isRateLimitError, className: "w-full bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-colors text-base", children: isLoading ? (_jsxs("span", { className: "flex items-center justify-center gap-2", children: [_jsxs("svg", { className: "animate-spin h-4 w-4", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8v8H4z" })] }), status === 'waiting' ? 'Confirm in MetaMask...' :
                                        status === 'relay_auth' ? 'Sign authorization (free)...' :
                                            status === 'relay_submitting' ? 'Relaying via backend...' :
                                                status === 'confirming' ? 'Waiting for block...' :
                                                    'Processing...'] })) : 'Generate Score' }), isLoading && (_jsx("div", { className: "pt-1", children: _jsx("div", { className: "flex items-center justify-between", children: STAGES.map((stage, i) => {
                                    const done = currentStageI > i;
                                    const active = currentStageI === i;
                                    return (_jsxs("div", { className: "flex items-center flex-1", children: [_jsxs("div", { className: "flex flex-col items-center gap-1 w-full", children: [_jsx("div", { className: `w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${done ? 'border-green-500 bg-green-950' :
                                                            active ? 'border-polkadot-pink bg-pink-950' :
                                                                'border-gray-700 bg-transparent'}`, children: done ? (_jsx("svg", { className: "h-3.5 w-3.5 text-green-400", fill: "currentColor", viewBox: "0 0 20 20", children: _jsx("path", { fillRule: "evenodd", d: "M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z", clipRule: "evenodd" }) })) : active ? (_jsxs("svg", { className: "animate-spin h-3.5 w-3.5 text-polkadot-pink", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8v8H4z" })] })) : (_jsx("div", { className: "w-2 h-2 rounded-full bg-gray-600" })) }), _jsx("span", { className: `text-xs hidden sm:block ${done ? 'text-green-400' : active ? 'text-polkadot-pink' : 'text-gray-600'}`, children: stage.label })] }), i < STAGES.length - 1 && (_jsx("div", { className: `h-px flex-1 mb-4 mx-1 transition-colors ${currentStageI > i ? 'bg-green-800' : 'bg-polkadot-border'}` }))] }, stage.key));
                                }) }) })), status === 'scoring' && (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-pink/30 rounded-xl px-4 py-3 text-sm text-center space-y-1.5", children: [_jsx("div", { className: "text-polkadot-pink font-medium animate-pulse", children: "\uD83E\uDD16 Mistral AI analysing your on-chain history\u2026" }), _jsx("div", { className: "text-xs text-gray-500 font-mono", children: elapsed < 5
                                        ? 'Fetching chain data via PAPI…'
                                        : elapsed < 20
                                            ? `Scoring in progress · ${elapsed}s`
                                            : elapsed < 45
                                                ? `Still working · ${elapsed}s — AI is thorough`
                                                : `Almost there · ${elapsed}s` }), _jsx("div", { className: "w-full bg-polkadot-border rounded-full h-1 overflow-hidden", children: _jsx("div", { className: "h-1 rounded-full bg-polkadot-pink transition-all duration-1000", style: { width: `${Math.min(95, (elapsed / 60) * 100)}%` } }) })] })), status === 'waiting' && (_jsxs("div", { className: "bg-yellow-950 border border-yellow-800 rounded-xl px-4 py-3 text-sm text-yellow-300 text-center space-y-1", children: [_jsx("div", { className: "animate-pulse font-medium", children: "\u26A1 Check MetaMask \u2014 confirm to mint your soulbound score NFT" }), gasEstimate ? (_jsxs("div", { className: "text-xs text-yellow-400/80 font-mono", children: ["Estimated fee: ", _jsxs("span", { className: "font-bold text-yellow-300", children: [gasEstimate.pas, " PAS"] }), _jsxs("span", { className: "text-yellow-600 ml-1", children: ["(~$", gasEstimate.usd, ")"] }), _jsx("span", { className: "ml-2 text-yellow-600", children: "\u00B7 Exact on-chain estimate" })] })) : (_jsx("div", { className: "text-xs text-yellow-600", children: "Calculating exact fee..." }))] })), status === 'relay_auth' && (_jsx("div", { className: "bg-blue-950 border border-blue-700 rounded-xl px-4 py-3 text-sm text-blue-300 text-center animate-pulse", children: "\uD83D\uDD10 Check MetaMask \u2014 sign the free authorization message (no gas required)" })), status === 'relay_submitting' && (_jsx("div", { className: "bg-purple-950 border border-purple-700 rounded-xl px-4 py-3 text-sm text-purple-300 text-center animate-pulse", children: "\uD83D\uDE80 Backend is minting your NFT on-chain \u2014 paying gas with USDT fee payment" })), status === 'idle' && totalScored !== null && (_jsx("div", { className: "grid grid-cols-3 gap-2 text-center", children: [
                                ['Wallets Scored', totalScored.toString(), '🏅'],
                                ['On-Chain NFTs', totalScored.toString(), '⛓'],
                                ['Network', 'PAS TestNet', '🔴'],
                            ].map(([label, value, icon]) => (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-xl py-3 px-2 space-y-1", children: [_jsx("div", { className: "text-lg", children: icon }), _jsx("div", { className: "font-mono font-bold text-white text-sm", children: value }), _jsx("div", { className: "text-gray-600 text-[10px] uppercase tracking-wider", children: label })] }, label))) })), status === 'idle' && (_jsxs("div", { className: "border border-polkadot-border rounded-xl p-5 space-y-4 mt-2", children: [_jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "How it works" }), HOW_IT_WORKS.map(([num, title, desc]) => (_jsxs("div", { className: "flex gap-3 text-sm", children: [_jsx("span", { className: "text-polkadot-pink font-mono font-bold w-6 shrink-0", children: num }), _jsxs("div", { children: [_jsxs("span", { className: "text-white font-medium", children: [title, " \u2014 "] }), _jsx("span", { className: "text-gray-400", children: desc })] })] }, num)))] }))] })), status === 'error' && isRateLimitError && (_jsxs("div", { className: "bg-polkadot-card border border-orange-800/50 rounded-2xl p-6 text-center space-y-4", children: [_jsx("div", { className: "text-3xl", children: "\u23F3" }), _jsxs("div", { className: "space-y-1", children: [_jsx("div", { className: "text-white font-bold text-base", children: "Score Already Requested" }), _jsx("div", { className: "text-gray-400 text-xs max-w-xs mx-auto", children: "This wallet was recently scored. Wait for the cooldown before requesting again." })] }), _jsxs("div", { className: "bg-orange-950/60 border border-orange-800/60 rounded-xl px-6 py-4 inline-block", children: [_jsx("div", { className: "text-[9px] text-orange-400 uppercase tracking-widest font-bold mb-1", children: "Try again in" }), _jsx("div", { className: "font-mono font-black text-orange-300 text-3xl tracking-tighter", children: rateLimitDisplaySec !== null && rateLimitDisplaySec > 0 ? formatWait(rateLimitDisplaySec) : 'now' })] }), _jsx("div", { children: _jsx("button", { onClick: reset, className: "text-[10px] text-gray-600 hover:text-gray-400 underline underline-offset-2 transition-colors", children: "Dismiss" }) })] })), status === 'error' && error === 'retry_available' && (_jsxs("div", { className: "bg-polkadot-card border border-yellow-700 rounded-2xl p-6 text-center space-y-4", children: [_jsx("div", { className: "text-2xl", children: "\u26A1" }), _jsxs("div", { className: "space-y-1", children: [_jsx("div", { className: "text-white font-semibold text-base", children: "Score Ready \u2014 Mint Pending" }), _jsx("div", { className: "text-gray-400 text-xs max-w-xs mx-auto", children: "Score generated but mint didn't complete. Reopen MetaMask to finish." })] }), _jsx("button", { onClick: () => retryMint(), className: "w-full bg-polkadot-pink hover:bg-pink-600 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm", children: "\u21BB Reopen MetaMask \u2014 finish minting" }), _jsx("button", { onClick: reset, className: "block mx-auto text-xs text-gray-500 hover:text-gray-400 underline underline-offset-2 transition-colors", children: "Start over instead" })] })), status === 'error' && error && !isRateLimitError && error !== 'retry_available' && (_jsxs("div", { className: "bg-red-950 border border-red-800 rounded-2xl p-5 space-y-3", children: [_jsxs("div", { className: "flex items-start gap-3", children: [_jsx("span", { className: "text-red-400 text-lg mt-0.5", children: "\u26A0" }), _jsxs("div", { className: "space-y-1 flex-1", children: [_jsx("div", { className: "text-red-300 text-sm font-medium", children: "Something went wrong" }), _jsx("div", { className: "text-red-400/80 text-xs leading-relaxed", children: error })] })] }), hasCachedPayload ? (_jsxs("div", { className: "space-y-2", children: [_jsx("button", { onClick: () => retryMint(), className: "w-full text-xs bg-polkadot-pink hover:bg-pink-600 text-white py-2.5 px-4 rounded-lg transition-colors font-medium", children: "\u21BB Retry mint \u2014 reopen MetaMask" }), _jsx("button", { onClick: reset, className: "w-full text-xs bg-red-900 hover:bg-red-800 text-red-300 py-2 px-4 rounded-lg transition-colors", children: "Start over (re-score)" })] })) : (_jsx("button", { onClick: reset, className: "w-full text-xs bg-red-900 hover:bg-red-800 text-red-300 py-2 px-4 rounded-lg transition-colors", children: "Try again" }))] })), status === 'cooldown' && (_jsxs("div", { className: "bg-polkadot-card border border-yellow-800/50 rounded-2xl p-6 text-center space-y-4", children: [_jsx("div", { className: "text-3xl", children: "\uD83D\uDD12" }), _jsxs("div", { className: "space-y-1", children: [_jsx("div", { className: "text-white font-bold text-base", children: "Score Already Valid" }), _jsx("div", { className: "text-gray-400 text-xs max-w-sm mx-auto", children: "Your VeraScore NFT is still active on-chain. You can refresh it after the cooldown period." })] }), cooldownTs && cooldownTs > 0 ? (_jsxs("div", { className: "bg-yellow-950/60 border border-yellow-800/60 rounded-xl px-6 py-4 inline-block", children: [_jsx("div", { className: "text-[9px] text-yellow-400 uppercase tracking-widest font-bold mb-1", children: "Refresh available" }), _jsx("div", { className: "font-mono font-black text-yellow-300 text-2xl tracking-tighter", children: liveRemaining(cooldownTs) }), _jsx("div", { className: "text-yellow-600 text-[10px] mt-1", children: fmt(cooldownTs) })] })) : (_jsx("div", { className: "bg-green-950/60 border border-green-800/60 rounded-xl px-6 py-3 inline-block", children: _jsx("div", { className: "text-green-300 text-sm font-bold", children: "\u2713 Refresh available now" }) })), _jsxs("div", { className: "text-gray-400 text-xs", children: ["View your current score in the", ' ', _jsx("button", { onClick: () => onNavigate('lookup'), className: "text-polkadot-pink hover:text-pink-400 underline", children: "Lookup" }), ' ', "tab."] }), _jsx("button", { onClick: reset, className: "w-full border border-polkadot-border hover:border-gray-500 text-gray-400 hover:text-white text-sm py-2 rounded-xl transition-colors", children: "Back" })] })), payload && status === 'done' && (_jsxs("div", { className: "space-y-4", children: [_jsx("div", { className: `rounded-xl px-4 py-3 text-sm text-center font-medium ${payload.alreadyHadScore
                                ? 'bg-blue-950 border border-blue-800 text-blue-300'
                                : 'bg-green-950 border border-green-800 text-green-300'}`, children: payload.alreadyHadScore
                                ? '✓ Score updated — soulbound NFT refreshed on-chain'
                                : '✓ Soulbound Score NFT minted to your wallet' }), _jsx(ScoreCard, { payload: payload, expiresAt: payload.expiresAt }), payload.txHash && (_jsx(NFTViewer, { wallet: payload.wallet, proxyAddress: SCORE_NFT_PROXY })), historyForChart.length > 0 && _jsx(HistoryChart, { history: historyForChart }), payload.relayed && (_jsx("div", { className: "bg-purple-950 border border-purple-700 rounded-xl px-4 py-2.5 text-xs text-purple-300 text-center", children: "\u2705 Minted via gasless relay \u2014 paid with USDT, zero PAS required" })), payload.txHash && (_jsxs("div", { className: "space-y-1.5 text-xs text-center", children: [_jsx("a", { href: `${EXPLORER}/tx/${payload.txHash}`, target: "_blank", rel: "noopener noreferrer", className: "block text-polkadot-pink hover:text-pink-400 font-mono transition-colors", children: "View mint transaction on Routescan \u2197" }), _jsx("a", { href: `${EXPLORER}/address/${SCORE_NFT_PROXY}`, target: "_blank", rel: "noopener noreferrer", className: "block text-gray-500 hover:text-gray-400 transition-colors", children: "View contract \u2197" })] })), _jsx("button", { onClick: () => { reset(); setFullHistory([]); }, className: "w-full border border-polkadot-border hover:border-gray-500 text-gray-400 hover:text-white text-sm py-2.5 rounded-xl transition-colors", children: "Score again" })] }))] }) }));
}
