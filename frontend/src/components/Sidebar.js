import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useBlockNumber } from 'wagmi';
import { useTotalScored } from '../hooks/useTotalScored.js';
import { pasTestnet, SCORE_NFT_PROXY } from '../utils/wagmi.js';
const EXPLORER = 'https://polkadot.testnet.routescan.io';
export const NAV = [
    { id: 'home', icon: '◈', label: 'Score' },
    { id: 'lookup', icon: '⌕', label: 'Lookup' },
    { id: 'leaderboard', icon: '🏆', label: 'Leaderboard' },
    { id: 'lending', icon: '⬡', label: 'Lending' },
    { id: 'send', icon: '↑', label: 'Send PAS' },
    { id: 'fees', icon: '⛽', label: 'Fee Calc' },
    { id: 'wallet', icon: '⊕', label: 'New Wallet', badge: 'NEW' },
];
export function Sidebar({ page, onNavigate }) {
    const { data: blockNumber } = useBlockNumber({
        chainId: pasTestnet.id,
        query: { refetchInterval: 6_000 },
    });
    const totalScored = useTotalScored();
    return (_jsxs("div", { className: "flex flex-col h-full", children: [_jsx("div", { className: "px-5 py-5 border-b border-polkadot-border", children: _jsxs("button", { onClick: () => onNavigate('home'), className: "flex items-center gap-3 hover:opacity-80 transition-opacity w-full text-left", children: [_jsx("div", { className: "w-9 h-9 bg-polkadot-pink rounded-xl flex items-center justify-center text-base font-bold shrink-0", children: "V" }), _jsxs("div", { children: [_jsx("div", { className: "font-bold text-sm tracking-tight text-white", children: "VeraScore" }), _jsx("div", { className: "text-[10px] text-gray-500", children: "AI Credit \u00B7 Polkadot Hub" })] })] }) }), _jsx("nav", { className: "flex-1 px-3 py-4 space-y-1 overflow-y-auto", children: NAV.map(({ id, icon, label, badge }) => (_jsxs("button", { onClick: () => onNavigate(id), className: `w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors border ${page === id
                        ? 'bg-polkadot-pink/15 text-white border-polkadot-pink/30 font-medium'
                        : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'}`, children: [_jsx("span", { className: `text-base w-5 text-center shrink-0 ${page === id ? 'text-polkadot-pink' : ''}`, children: icon }), _jsx("span", { className: "flex-1", children: label }), badge && (_jsx("span", { className: "text-[9px] bg-polkadot-pink text-white px-1.5 py-0.5 rounded-full font-semibold leading-none", children: badge }))] }, id))) }), _jsxs("div", { className: "px-4 py-4 border-t border-polkadot-border space-y-2", children: [_jsxs("div", { className: "flex items-center gap-2 text-[11px]", children: [_jsx("span", { className: "inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" }), _jsx("span", { className: "text-gray-400", children: "PAS TestNet" }), _jsx("span", { className: "text-polkadot-border", children: "\u00B7" }), _jsxs("span", { className: "text-gray-500", children: ["ID ", pasTestnet.id] })] }), blockNumber !== undefined && (_jsxs("div", { className: "text-[11px] text-gray-600 font-mono", children: ["Block #", blockNumber.toLocaleString()] })), totalScored !== null && (_jsxs("div", { className: "text-[11px] text-gray-600", children: [totalScored, " wallet", totalScored !== 1 ? 's' : '', " scored"] })), _jsxs("a", { href: `${EXPLORER}/address/${SCORE_NFT_PROXY}`, target: "_blank", rel: "noopener noreferrer", className: "block text-[10px] font-mono text-gray-700 hover:text-gray-500 transition-colors truncate", children: [SCORE_NFT_PROXY?.slice(0, 14), "\u2026", SCORE_NFT_PROXY?.slice(-6), " \u2197"] })] })] }));
}
