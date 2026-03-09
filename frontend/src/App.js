import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useRef, useEffect, useCallback } from 'react';
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain, useBlockNumber, useBalance, } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { Sidebar } from './components/Sidebar.js';
import { NAV } from './components/Sidebar.js';
import { Home } from './pages/Home.js';
import { Lookup } from './pages/Lookup.js';
import { LendingDemo } from './pages/LendingDemo.js';
import { SendPAS } from './pages/SendPAS.js';
import { FeeCalculator } from './pages/FeeCalculator.js';
import { Leaderboard } from './pages/Leaderboard.js';
import { CreateWallet } from './pages/CreateWallet.js';
import { SendStablecoin } from './pages/SendStablecoin.js';
import { pasTestnet, SCORE_NFT_PROXY } from './utils/wagmi.js';
const EXPLORER = 'https://polkadot.testnet.routescan.io';
export default function App() {
    const { address, isConnected } = useAccount();
    const { connect } = useConnect();
    const { disconnect } = useDisconnect();
    const chainId = useChainId();
    const { switchChain } = useSwitchChain();
    const { data: balData, refetch: refetchBal } = useBalance({
        address,
        chainId: pasTestnet.id,
        query: { refetchInterval: 4_000 },
    });
    const balNum = balData ? Number(balData.value) / 1e18 : null;
    const balShort = balNum !== null
        ? balNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' PAS'
        : '—';
    const balFull = balNum !== null
        ? balNum.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + ' PAS'
        : '—';
    const [page, setPage] = useState('home');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [walletOpen, setWalletOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const walletRef = useRef(null);
    const sidebarRef = useRef(null);
    useEffect(() => {
        function onOut(e) {
            if (walletRef.current && !walletRef.current.contains(e.target))
                setWalletOpen(false);
        }
        document.addEventListener('mousedown', onOut);
        return () => document.removeEventListener('mousedown', onOut);
    }, []);
    useEffect(() => {
        function onOut(e) {
            if (sidebarRef.current && !sidebarRef.current.contains(e.target))
                setSidebarOpen(false);
        }
        document.addEventListener('mousedown', onOut);
        return () => document.removeEventListener('mousedown', onOut);
    }, []);
    useEffect(() => {
        function onKey(e) {
            if (e.key === 'Escape') {
                setSidebarOpen(false);
                setWalletOpen(false);
            }
        }
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);
    const navigate = useCallback((p) => {
        setPage(p);
        setSidebarOpen(false);
    }, []);
    function copyAddress() {
        if (!address)
            return;
        navigator.clipboard.writeText(address).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }
    const { data: blockNumber } = useBlockNumber({
        chainId: pasTestnet.id,
        query: { refetchInterval: 6_000 },
    });
    const isWrongNetwork = isConnected && chainId !== pasTestnet.id;
    return (_jsxs("div", { className: "min-h-screen bg-polkadot-dark text-white flex", children: [_jsx("aside", { className: "hidden lg:flex flex-col w-56 shrink-0 border-r border-polkadot-border bg-polkadot-card fixed top-0 left-0 h-full z-30", children: _jsx(Sidebar, { page: page, onNavigate: navigate }) }), sidebarOpen && (_jsxs("div", { className: "fixed inset-0 z-40 lg:hidden", children: [_jsx("div", { className: "absolute inset-0 bg-black/60", onClick: () => setSidebarOpen(false) }), _jsx("aside", { ref: sidebarRef, className: "absolute left-0 top-0 h-full w-56 bg-polkadot-card border-r border-polkadot-border z-50", children: _jsx(Sidebar, { page: page, onNavigate: navigate }) })] })), _jsxs("div", { className: "flex-1 flex flex-col min-h-screen lg:ml-56", children: [_jsxs("header", { className: "sticky top-0 z-20 border-b border-polkadot-border bg-polkadot-dark/95 backdrop-blur px-4 sm:px-6 py-3 flex items-center justify-between shrink-0", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { onClick: () => setSidebarOpen(o => !o), className: "lg:hidden p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors", "aria-label": "Toggle sidebar", children: _jsx("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M4 6h16M4 12h16M4 18h16" }) }) }), _jsx("div", { className: "text-sm font-medium text-gray-300 hidden sm:block", children: NAV.find(n => n.id === page)?.label })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("div", { className: "hidden sm:flex items-center gap-2 text-[11px] text-gray-500 border border-polkadot-border rounded-lg px-3 py-1.5 font-mono bg-polkadot-card", children: [_jsx("span", { className: "inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" }), _jsx("span", { children: "PAS TestNet" }), blockNumber !== undefined && (_jsxs(_Fragment, { children: [_jsx("span", { className: "text-polkadot-border", children: "\u00B7" }), _jsxs("span", { children: ["#", blockNumber.toLocaleString()] })] }))] }), isWrongNetwork && (_jsx("button", { onClick: () => switchChain({ chainId: pasTestnet.id }), className: "text-xs bg-yellow-500 hover:bg-yellow-400 text-black px-3 py-1.5 rounded-lg font-medium transition-colors", children: "Switch Network" })), isConnected ? (_jsxs("div", { ref: walletRef, className: "relative", children: [_jsxs("button", { onClick: () => setWalletOpen(o => !o), className: `flex items-center gap-2 text-xs border px-3 py-1.5 rounded-lg font-mono transition-colors ${walletOpen
                                                    ? 'border-polkadot-pink text-white bg-polkadot-pink/10'
                                                    : 'border-polkadot-border hover:border-gray-500 text-gray-300'}`, children: [_jsx("span", { className: "inline-block w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" }), _jsx("span", { className: "text-polkadot-pink font-semibold hidden sm:inline", children: balShort }), _jsx("span", { className: "text-gray-400 hidden sm:inline text-[10px]", children: "\u00B7" }), _jsxs("span", { children: [address.slice(0, 6), "\u2026", address.slice(-4)] }), _jsx("svg", { className: `w-3 h-3 transition-transform ${walletOpen ? 'rotate-180' : ''}`, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M19 9l-7 7-7-7" }) })] }), walletOpen && (_jsxs("div", { className: "absolute right-0 mt-2 w-72 bg-polkadot-card border border-polkadot-border rounded-xl shadow-2xl z-50 overflow-hidden", children: [_jsxs("div", { className: "px-4 py-3 border-b border-polkadot-border", children: [_jsx("div", { className: "text-[10px] text-gray-500 uppercase tracking-widest mb-1", children: "Connected Wallet" }), _jsx("div", { className: "font-mono text-xs text-gray-200 break-all", children: address })] }), _jsxs("div", { className: "px-4 py-3 border-b border-polkadot-border flex items-center justify-between", children: [_jsx("div", { className: "text-[10px] text-gray-500 uppercase tracking-widest", children: "Balance" }), _jsx("div", { className: "font-mono text-sm text-polkadot-pink font-bold", children: balFull })] }), _jsxs("div", { className: "px-4 py-2.5 border-b border-polkadot-border flex items-center justify-between", children: [_jsx("div", { className: "text-[10px] text-gray-500 uppercase tracking-widest", children: "Network" }), _jsx("div", { className: "text-[11px] flex items-center gap-1.5", children: isWrongNetwork
                                                                    ? _jsx("span", { className: "text-yellow-400", children: "\u26A0 Wrong network" })
                                                                    : _jsxs(_Fragment, { children: [_jsx("span", { className: "inline-block w-1.5 h-1.5 rounded-full bg-green-500" }), _jsx("span", { className: "text-gray-300", children: "PAS TestNet" })] }) })] }), _jsxs("div", { className: "py-1", children: [_jsx("button", { onClick: copyAddress, className: "w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-polkadot-dark hover:text-white transition-colors flex items-center gap-3", children: copied
                                                                    ? _jsxs(_Fragment, { children: [_jsx("span", { className: "text-green-400", children: "\u2713" }), _jsx("span", { className: "text-green-400", children: "Copied!" })] })
                                                                    : _jsxs(_Fragment, { children: [_jsx("span", { children: "\uD83D\uDCCB" }), _jsx("span", { children: "Copy address" })] }) }), _jsxs("a", { href: `${EXPLORER}/address/${address}`, target: "_blank", rel: "noopener noreferrer", onClick: () => setWalletOpen(false), className: "w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-polkadot-dark hover:text-white transition-colors flex items-center gap-3", children: [_jsx("span", { children: "\u2197" }), _jsx("span", { children: "View on Explorer" })] }), _jsxs("button", { onClick: () => { navigate('send'); setWalletOpen(false); }, className: "w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-polkadot-dark hover:text-white transition-colors flex items-center gap-3", children: [_jsx("span", { children: "\u2191" }), _jsx("span", { children: "Send PAS" })] }), _jsx("div", { className: "border-t border-polkadot-border mx-4 my-1" }), _jsxs("button", { onClick: () => { disconnect(); setWalletOpen(false); }, className: "w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-950 hover:text-red-300 transition-colors flex items-center gap-3", children: [_jsx("span", { children: "\u23CF" }), _jsx("span", { children: "Disconnect" })] })] })] }))] })) : (_jsx("button", { onClick: () => connect({ connector: injected() }), className: "bg-polkadot-pink hover:bg-pink-600 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors", children: "Connect Wallet" }))] })] }), isWrongNetwork && (_jsxs("div", { className: "flex items-center justify-between bg-yellow-900/40 border-b border-yellow-800/50 px-5 py-2.5 text-sm", children: [_jsx("span", { className: "text-yellow-300 text-xs font-medium", children: "\u26A0 Wrong network \u2014 switch to Polkadot Hub TestNet to transact" }), _jsx("button", { onClick: () => switchChain({ chainId: pasTestnet.id }), className: "ml-4 shrink-0 bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-3 py-1 rounded-lg text-xs transition", children: "Switch" })] })), _jsxs("main", { className: "flex-1", children: [page === 'home' && _jsx(Home, { onNavigate: navigate }), page === 'lookup' && _jsx(Lookup, {}), page === 'leaderboard' && _jsx(Leaderboard, {}), page === 'lending' && _jsx(LendingDemo, {}), page === 'send' && _jsx(SendPAS, { onSuccess: () => refetchBal() }), page === 'fees' && _jsx(FeeCalculator, {}), page === 'stables' && _jsx(SendStablecoin, {}), page === 'wallet' && _jsx(CreateWallet, { onNavigateHome: () => navigate('home') })] }), _jsx("footer", { className: "border-t border-polkadot-border px-5 py-4 shrink-0", children: _jsxs("div", { className: "flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-gray-700", children: [_jsx("span", { children: "VeraScore \u00B7 AI Credit Scoring \u00B7 Polkadot Hub PAS TestNet \u00B7 Hackathon 2026" }), _jsxs("a", { href: `${EXPLORER}/address/${SCORE_NFT_PROXY}`, target: "_blank", rel: "noopener noreferrer", className: "hover:text-gray-500 font-mono transition-colors", children: ["ScoreNFT: ", SCORE_NFT_PROXY?.slice(0, 10), "\u2026", SCORE_NFT_PROXY?.slice(-6), " \u2197"] })] }) })] })] }));
}
