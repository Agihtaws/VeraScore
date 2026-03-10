import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect, useCallback } from 'react';
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain, useBlockNumber, useBalance, } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { Sidebar } from './components/Sidebar';
import { NAV } from './components/Sidebar';
import { Home } from './pages/Home';
import { Lookup } from './pages/Lookup';
import { LendingDemo } from './pages/LendingDemo';
import { SendPAS } from './pages/SendPAS';
import { FeeCalculator } from './pages/FeeCalculator';
import { Leaderboard } from './pages/Leaderboard';
import { CreateWallet } from './pages/CreateWallet';
import { SendStablecoin } from './pages/SendStablecoin';
import { pasTestnet, SCORE_NFT_PROXY } from './utils/wagmi';
const EXPLORER = 'https://polkadot.testnet.routescan.io';
export default function App() {
    const { address, isConnected } = useAccount();
    const { connect } = useConnect();
    const { disconnect } = useDisconnect();
    const chainId = useChainId();
    const { switchChain } = useSwitchChain();
    // ── PAS balance — refetchInterval polls every 6s via React Query ────────────
    // NOTE: do NOT use watch:true — with HTTP transport + custom chain it can
    //       silently fail. query.refetchInterval is reliable for all networks.
    const { data: balData, refetch: refetchBal } = useBalance({
        address,
        chainId: pasTestnet.id,
        query: {
            enabled: !!address, // don't fire until wallet is connected
            refetchInterval: 6_000, // poll every 6s
            staleTime: 0, // always treat cached value as stale → refetch immediately
            retry: 3, // retry up to 3 times on RPC error
        },
    });
    const balNum = balData ? Number(balData.value) / 1e18 : null;
    const balShort = balNum !== null
        ? balNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' PAS'
        : '—';
    const balFull = balNum !== null
        ? balNum.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + ' PAS'
        : '—';
    // ── Block number — query.refetchInterval works reliably on HTTP transports ───
    // watch:true uses watchBlockNumber (needs WebSocket/long-poll) and silently
    // fails for custom chains on plain HTTP. Use refetchInterval instead.
    const { data: blockNumber } = useBlockNumber({
        chainId: pasTestnet.id,
        query: {
            refetchInterval: 4_000, // poll every 4s
            staleTime: 0,
            retry: 3,
        },
    });
    const [page, setPage] = useState('home');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [walletOpen, setWalletOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const walletRef = useRef(null);
    const sidebarRef = useRef(null);
    // Close dropdowns on outside click
    useEffect(() => {
        function onOut(e) {
            if (walletRef.current && !walletRef.current.contains(e.target))
                setWalletOpen(false);
            if (sidebarRef.current && !sidebarRef.current.contains(e.target))
                setSidebarOpen(false);
        }
        document.addEventListener('mousedown', onOut);
        return () => document.removeEventListener('mousedown', onOut);
    }, []);
    const navigate = useCallback((p) => {
        setPage(p);
        setSidebarOpen(false);
        window.scrollTo(0, 0);
    }, []);
    function copyAddress() {
        if (!address)
            return;
        navigator.clipboard.writeText(address).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }
    const isWrongNetwork = isConnected && chainId !== pasTestnet.id;
    return (_jsxs("div", { className: "min-h-screen bg-polkadot-dark text-white flex font-sans", children: [_jsx("aside", { className: "hidden lg:flex flex-col w-64 shrink-0 border-r border-polkadot-border bg-polkadot-card fixed top-0 left-0 h-full z-30 shadow-2xl", children: _jsx(Sidebar, { page: page, onNavigate: navigate }) }), sidebarOpen && (_jsxs("div", { className: "fixed inset-0 z-40 lg:hidden", children: [_jsx("div", { className: "absolute inset-0 bg-black/80 backdrop-blur-sm", onClick: () => setSidebarOpen(false) }), _jsx("aside", { ref: sidebarRef, className: "absolute left-0 top-0 h-full w-64 bg-polkadot-card border-r border-polkadot-border z-50", children: _jsx(Sidebar, { page: page, onNavigate: navigate }) })] })), _jsxs("div", { className: "flex-1 flex flex-col min-h-screen lg:ml-64", children: [_jsxs("header", { className: "sticky top-0 z-20 border-b border-polkadot-border bg-polkadot-dark/80 backdrop-blur-xl px-4 sm:px-8 py-4 flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("button", { onClick: () => setSidebarOpen(o => !o), className: "lg:hidden p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all", children: _jsx("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2.5, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M4 6h16M4 12h16M4 18h16" }) }) }), _jsx("div", { className: "text-xs font-black uppercase tracking-[0.2em] text-gray-500 hidden sm:block", children: NAV.find(n => n.id === page)?.label })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("div", { className: "hidden md:flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-gray-500 border border-polkadot-border rounded-lg px-3 py-1.5 bg-black/20", children: [_jsxs("span", { className: "relative flex h-1.5 w-1.5 shrink-0", children: [_jsx("span", { className: "animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" }), _jsx("span", { className: "relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" })] }), _jsx("span", { children: "PAS HUB" }), blockNumber !== undefined ? (_jsxs("span", { className: "text-gray-400 font-mono", children: ["#", blockNumber.toLocaleString()] })) : (_jsx("span", { className: "text-gray-700 animate-pulse", children: "syncing\u2026" }))] }), isConnected ? (_jsxs("div", { ref: walletRef, className: "relative", children: [_jsxs("button", { onClick: () => setWalletOpen(o => !o), className: `flex items-center gap-2 text-[11px] border px-3 py-1.5 rounded-lg font-mono transition-all ${walletOpen
                                                    ? 'border-polkadot-pink text-white bg-polkadot-pink/10'
                                                    : 'border-polkadot-border bg-white/5 text-gray-300'}`, children: [_jsx("span", { className: "text-polkadot-pink font-black hidden sm:inline", children: balNum !== null ? balShort : _jsx("span", { className: "animate-pulse text-gray-600", children: "\u00B7\u00B7\u00B7" }) }), _jsxs("span", { children: [address.slice(0, 6), "\u2026", address.slice(-4)] })] }), walletOpen && (_jsx("div", { className: "absolute right-0 mt-2 w-64 bg-polkadot-card border border-polkadot-border rounded-xl shadow-2xl z-50 overflow-hidden", children: _jsxs("div", { className: "p-4 space-y-3", children: [_jsxs("div", { children: [_jsx("div", { className: "text-[9px] text-gray-600 font-black uppercase tracking-widest mb-1", children: "Active Identity" }), _jsx("div", { className: "font-mono text-[10px] text-white break-all bg-black/20 p-2 rounded-lg border border-white/5 leading-relaxed", children: address })] }), _jsxs("div", { className: "flex justify-between items-center border-t border-white/5 pt-3", children: [_jsxs("div", { children: [_jsx("div", { className: "text-[9px] text-gray-600 font-black uppercase tracking-widest mb-0.5", children: "Balance" }), _jsx("div", { className: "font-mono text-sm font-black text-polkadot-pink", children: balNum !== null ? balFull : _jsx("span", { className: "animate-pulse text-gray-600 text-xs", children: "Loading\u2026" }) })] }), _jsx("button", { onClick: copyAddress, className: "text-[9px] font-black uppercase text-gray-500 hover:text-white transition-colors", children: copied ? '✓' : 'Copy' })] }), _jsx("button", { onClick: () => { disconnect(); setWalletOpen(false); }, className: "w-full px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all", children: "Disconnect" })] }) }))] })) : (_jsx("button", { onClick: () => connect({ connector: injected() }), className: "bg-polkadot-pink hover:bg-pink-600 text-white text-[10px] font-black uppercase tracking-widest px-6 py-2.5 rounded-xl transition-all shadow-lg", children: "Connect Wallet" }))] })] }), isWrongNetwork && (_jsxs("div", { className: "bg-yellow-500 text-black px-6 py-2 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-4", children: ["\u26A0\uFE0F Network Mismatch \u2014 switch to Polkadot Hub TestNet", _jsx("button", { onClick: () => switchChain({ chainId: pasTestnet.id }), className: "bg-black text-white px-3 py-1 rounded-lg text-[9px] hover:opacity-80", children: "Switch Now" })] })), _jsxs("main", { className: "flex-1", children: [page === 'home' && _jsx(Home, { onNavigate: navigate }), page === 'lookup' && _jsx(Lookup, {}), page === 'leaderboard' && _jsx(Leaderboard, {}), page === 'lending' && _jsx(LendingDemo, {}), page === 'send' && _jsx(SendPAS, { onSuccess: () => refetchBal() }), page === 'fees' && _jsx(FeeCalculator, {}), page === 'stables' && _jsx(SendStablecoin, {}), page === 'wallet' && _jsx(CreateWallet, { onNavigateHome: () => navigate('home') })] }), _jsx("footer", { className: "border-t border-polkadot-border px-8 py-6 bg-black/20", children: _jsxs("div", { className: "max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4", children: [_jsx("div", { className: "text-[10px] font-black uppercase tracking-[0.3em] text-gray-600", children: "VeraScore Protocol v2.1" }), _jsxs("a", { href: `${EXPLORER}/address/${SCORE_NFT_PROXY}`, target: "_blank", rel: "noopener noreferrer", className: "text-[9px] font-mono text-gray-700 hover:text-polkadot-pink transition-all", children: ["PROXY: ", SCORE_NFT_PROXY?.slice(0, 10), "\u2026", SCORE_NFT_PROXY?.slice(-6), " \u2197"] })] }) })] })] }));
}
