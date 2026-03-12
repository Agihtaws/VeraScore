'use client';
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useCallback } from 'react';
import { generateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { mnemonicToSeedSync } from '@scure/bip39';
import { HDKey } from '@scure/bip32';
import { privateKeyToAccount } from 'viem/accounts';
import { bytesToHex } from 'viem';
const FAUCET_URL = 'https://faucet.polkadot.io/?parachain=1111';
const CHAIN_ID = '0x18F432A1';
const CHAIN_NAME = 'Polkadot Hub TestNet';
const RPC_URL = 'https://services.polkadothub-rpc.com/testnet';
const EXPLORER = 'https://polkadot.testnet.routescan.io';
function deriveWallet(mnemonic) {
    const seed = mnemonicToSeedSync(mnemonic);
    const hdKey = HDKey.fromMasterSeed(seed);
    const child = hdKey.derive("m/44'/60'/0'/0/0");
    const privateKey = bytesToHex(child.privateKey);
    const account = privateKeyToAccount(privateKey);
    return { mnemonic, privateKey, address: account.address };
}
function CopyButton({ text, label = 'Copy' }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    return (_jsx("button", { onClick: copy, className: "flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-500 hover:text-white transition-all", children: copied ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "text-emerald-400", children: "\u2713" }), _jsx("span", { className: "text-emerald-400", children: "Copied" })] })) : (_jsxs(_Fragment, { children: [_jsx("svg", { className: "w-3 h-3", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" }) }), _jsx("span", { children: label })] })) }));
}
function StepDots({ step }) {
    return (_jsx("div", { className: "flex items-center gap-1.5", children: [1, 2, 3, 4].map(s => (_jsx("div", { className: `h-1 rounded-full transition-all duration-300 ${s === step ? 'w-5 bg-polkadot-pink' : s < step ? 'w-2.5 bg-polkadot-pink/40' : 'w-2.5 bg-white/10'}` }, s))) }));
}
// ── Step 1 ─────────────────────────────────────────────────────────────────────
function Step1({ onGenerate }) {
    const [loading, setLoading] = useState(false);
    const generate = useCallback(() => {
        setLoading(true);
        setTimeout(() => {
            const mnemonic = generateMnemonic(wordlist, 128);
            onGenerate(deriveWallet(mnemonic));
            setLoading(false);
        }, 300);
    }, [onGenerate]);
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-base font-black uppercase tracking-tight text-white", children: "Create a New Wallet" }), _jsx("p", { className: "text-[10px] text-gray-600 mt-1 leading-relaxed", children: "Generate a fresh Polkadot Hub wallet \u2014 fully in your browser, never sent anywhere. You'll get a seed phrase and private key to import into MetaMask." })] }), _jsx("div", { className: "space-y-1.5", children: [
                    ['→', '12-word seed phrase', 'Standard BIP39 — works with any wallet'],
                    ['→', 'MetaMask-ready', 'Import via private key in seconds'],
                    ['→', '100% client-side', 'Nothing leaves your browser'],
                ].map(([icon, title, desc]) => (_jsxs("div", { className: "flex items-start gap-2.5 bg-white/[0.02] rounded-xl px-3 py-2.5 border border-white/5", children: [_jsx("span", { className: "text-polkadot-pink font-black text-[9px] mt-0.5 shrink-0", children: icon }), _jsxs("div", { children: [_jsx("div", { className: "text-[10px] font-bold uppercase tracking-wide text-white", children: title }), _jsx("div", { className: "text-[9px] text-gray-600 mt-0.5", children: desc })] })] }, title))) }), _jsxs("div", { className: "flex gap-2.5 bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2.5", children: [_jsx("span", { className: "text-amber-400 text-[10px] shrink-0 font-black", children: "\u26A0" }), _jsx("p", { className: "text-[9px] text-amber-300/80 leading-relaxed", children: "You will be shown a seed phrase. Write it down on paper and store it safely. Anyone with your seed phrase has full access to your funds." })] }), _jsx("button", { onClick: generate, disabled: loading, className: "w-full py-3 rounded-xl bg-polkadot-pink hover:bg-pink-600 disabled:opacity-60 text-white font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-[0_0_12px_rgba(230,0,122,0.2)]", children: loading ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" }), "Generating\u2026"] })) : 'Generate Wallet' }), _jsxs("p", { className: "text-center text-[9px] text-gray-700", children: ["Already have a wallet?", ' ', _jsx("a", { href: "#", className: "text-polkadot-pink hover:underline", onClick: e => { e.preventDefault(); window.dispatchEvent(new CustomEvent('vs:navigate', { detail: 'home' })); }, children: "Go to Score \u2192" })] })] }));
}
// ── Step 2 ─────────────────────────────────────────────────────────────────────
function Step2({ wallet, onNext }) {
    const [revealed, setRevealed] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const words = wallet.mnemonic.split(' ');
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-base font-black uppercase tracking-tight text-white", children: "Save Your Seed Phrase" }), _jsx("p", { className: "text-[10px] text-gray-600 mt-1 leading-relaxed", children: "Write these 12 words down in order. This is the only way to recover your wallet." })] }), _jsxs("div", { className: "relative", children: [_jsx("div", { className: `grid grid-cols-3 gap-1.5 transition-all duration-300 ${!revealed ? 'blur-md select-none pointer-events-none' : ''}`, children: words.map((word, i) => (_jsxs("div", { className: "flex items-center gap-2 bg-polkadot-card border border-polkadot-border rounded-lg px-2.5 py-1.5", children: [_jsx("span", { className: "text-[8px] text-gray-700 w-3 shrink-0 text-right", children: i + 1 }), _jsx("span", { className: "text-xs font-mono text-white font-medium", children: word })] }, i))) }), !revealed && (_jsx("div", { className: "absolute inset-0 flex items-center justify-center", children: _jsxs("button", { onClick: () => setRevealed(true), className: "flex items-center gap-1.5 bg-polkadot-card border border-polkadot-border rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:border-polkadot-pink/50 transition-all shadow-xl", children: [_jsxs("svg", { className: "w-3.5 h-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: [_jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M15 12a3 3 0 11-6 0 3 3 0 016 0z" }), _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" })] }), "Reveal"] }) }))] }), revealed && (_jsx("div", { className: "flex justify-end", children: _jsx(CopyButton, { text: wallet.mnemonic, label: "Copy all words" }) })), _jsxs("div", { className: "flex gap-2.5 bg-red-500/5 border border-red-500/20 rounded-xl px-3 py-2.5", children: [_jsx("span", { className: "text-red-400 text-[9px] shrink-0 font-black mt-0.5", children: "\u2717" }), _jsx("p", { className: "text-[9px] text-red-300/80 leading-relaxed", children: "Never share your seed phrase with anyone. VeraScore will never ask for it. Store it offline \u2014 not in screenshots, cloud storage, or messages." })] }), _jsxs("label", { className: "flex items-start gap-2.5 cursor-pointer group", children: [_jsx("div", { onClick: () => setConfirmed(c => !c), className: `mt-0.5 w-4 h-4 rounded shrink-0 border-2 flex items-center justify-center transition-all ${confirmed ? 'bg-polkadot-pink border-polkadot-pink' : 'border-gray-600 group-hover:border-gray-400'}`, children: confirmed && _jsx("svg", { className: "w-2.5 h-2.5 text-white", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 3, d: "M5 13l4 4L19 7" }) }) }), _jsx("span", { className: "text-xs text-gray-500 group-hover:text-gray-400 transition-colors select-none", children: "I have written down my seed phrase and stored it safely" })] }), _jsx("button", { onClick: onNext, disabled: !confirmed || !revealed, className: "w-full py-3 rounded-xl bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-widest transition-all", children: "Continue to MetaMask Import \u2192" })] }));
}
// ── Step 3 ─────────────────────────────────────────────────────────────────────
function Step3({ wallet, onNext }) {
    const [showKey, setShowKey] = useState(false);
    const [adding, setAdding] = useState(false);
    const [netAdded, setNetAdded] = useState(false);
    const addNetwork = async () => {
        if (!window.ethereum)
            return;
        setAdding(true);
        try {
            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{ chainId: CHAIN_ID, chainName: CHAIN_NAME, rpcUrls: [RPC_URL],
                        nativeCurrency: { name: 'PAS', symbol: 'PAS', decimals: 18 },
                        blockExplorerUrls: [EXPLORER] }],
            });
            setNetAdded(true);
        }
        catch { /* user rejected */ }
        setAdding(false);
    };
    const importToMetaMask = async () => {
        if (!window.ethereum)
            return;
        try {
            await window.ethereum.request({ method: 'wallet_importAccount', params: [wallet.privateKey] });
        }
        catch {
            setShowKey(true);
        }
    };
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-base font-black uppercase tracking-tight text-white", children: "Import to MetaMask" }), _jsx("p", { className: "text-[10px] text-gray-600 mt-1 leading-relaxed", children: "Add Polkadot Hub TestNet to MetaMask, then import your private key." })] }), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsxs("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20 flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: `w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${netAdded ? 'bg-emerald-500' : 'bg-polkadot-pink'}`, children: netAdded ? '✓' : '1' }), _jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-gray-400", children: "Add Network" })] }), netAdded && _jsx("span", { className: "text-[9px] font-bold text-emerald-400", children: "Added \u2713" })] }), !netAdded && (_jsx("div", { className: "px-4 py-3", children: _jsx("button", { onClick: addNetwork, disabled: adding, className: "w-full py-2.5 rounded-xl bg-polkadot-pink/10 hover:bg-polkadot-pink/20 border border-polkadot-pink/30 text-polkadot-pink text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-60", children: adding ? _jsxs(_Fragment, { children: [_jsx("span", { className: "w-3 h-3 border-2 border-pink-400/30 border-t-pink-400 rounded-full animate-spin" }), "Adding\u2026"] }) : '🦊 Add to MetaMask' }) }))] }), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsxs("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20 flex items-center gap-2", children: [_jsx("span", { className: "w-5 h-5 rounded-full bg-polkadot-pink flex items-center justify-center text-[10px] font-black shrink-0", children: "2" }), _jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-gray-400", children: "Import Private Key" })] }), _jsxs("div", { className: "px-4 py-3 space-y-2.5", children: [_jsx("p", { className: "text-[9px] text-gray-600 leading-relaxed", children: "MetaMask \u2192 Account selector \u2192 Add account \u2192 Import account \u2192 paste key." }), _jsxs("div", { className: "relative", children: [_jsx("div", { className: `font-mono text-[10px] break-all px-3 py-2.5 rounded-xl bg-black/40 border border-white/5 text-gray-400 transition-all ${!showKey ? 'blur-sm select-none' : ''}`, children: wallet.privateKey }), !showKey && (_jsx("div", { className: "absolute inset-0 flex items-center justify-center", children: _jsxs("button", { onClick: () => setShowKey(true), className: "flex items-center gap-1.5 bg-polkadot-card border border-polkadot-border rounded-lg px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white hover:border-polkadot-pink/40 transition-all", children: [_jsxs("svg", { className: "w-3 h-3", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: [_jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M15 12a3 3 0 11-6 0 3 3 0 016 0z" }), _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" })] }), "Reveal"] }) }))] }), showKey && (_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("p", { className: "text-[9px] font-bold text-red-400", children: "\u26A0 Never share this key" }), _jsx(CopyButton, { text: wallet.privateKey, label: "Copy key" })] }))] })] }), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsxs("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20 flex items-center justify-between", children: [_jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-gray-500", children: "Your EVM Address" }), _jsx(CopyButton, { text: wallet.address, label: "Copy" })] }), _jsx("div", { className: "px-4 py-3", children: _jsx("p", { className: "font-mono text-xs text-white break-all", children: wallet.address }) })] }), _jsx("button", { onClick: onNext, className: "w-full py-3 rounded-xl bg-polkadot-pink hover:bg-pink-600 text-white font-bold text-xs uppercase tracking-widest transition-all", children: "Continue to Fund Wallet \u2192" })] }));
}
// ── Step 4 ─────────────────────────────────────────────────────────────────────
function Step4({ wallet, onNavigateHome }) {
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-base shrink-0", children: "\u2713" }), _jsxs("div", { children: [_jsx("h2", { className: "text-base font-black uppercase tracking-tight text-white", children: "Wallet Ready!" }), _jsx("p", { className: "text-[9px] text-gray-600 mt-0.5", children: "Fund with PAS then get your credit score." })] })] }), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsxs("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20 flex items-center justify-between", children: [_jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-gray-500", children: "Your Address" }), _jsx(CopyButton, { text: wallet.address, label: "Copy" })] }), _jsx("div", { className: "px-4 py-3", children: _jsx("p", { className: "font-mono text-[10px] text-white break-all", children: wallet.address }) })] }), _jsx("div", { className: "grid grid-cols-1 gap-2", children: [
                    { href: FAUCET_URL, icon: '🚰', title: 'Get PAS from Faucet', sub: 'faucet.polkadot.io — free testnet tokens' },
                    { href: `${EXPLORER}/address/${wallet.address}`, icon: '🔍', title: 'View on Routescan', sub: 'Track balance and transactions' },
                ].map(({ href, icon, title, sub }) => (_jsxs("a", { href: href, target: "_blank", rel: "noopener noreferrer", className: "flex items-center justify-between bg-polkadot-card hover:bg-white/5 border border-polkadot-border hover:border-polkadot-pink/30 rounded-xl px-4 py-3 transition-all group", children: [_jsxs("div", { className: "flex items-center gap-2.5", children: [_jsx("span", { className: "text-lg", children: icon }), _jsxs("div", { children: [_jsx("div", { className: "text-[10px] font-bold uppercase tracking-wide text-white", children: title }), _jsx("div", { className: "text-[9px] text-gray-600", children: sub })] })] }), _jsx("svg", { className: "w-3.5 h-3.5 text-gray-700 group-hover:text-polkadot-pink transition-colors shrink-0", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" }) })] }, href))) }), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsx("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20", children: _jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-gray-500", children: "What's Next" }) }), _jsx("div", { className: "px-4 py-3 space-y-2", children: [
                            'Paste your address in the faucet and request PAS',
                            'Import the private key into MetaMask',
                            'Connect MetaMask on the Score page',
                            'Get your AI credit score minted on-chain',
                        ].map((step, i) => (_jsxs("div", { className: "flex items-start gap-2.5", children: [_jsx("span", { className: "w-4 h-4 rounded-full bg-polkadot-pink/15 border border-polkadot-pink/30 text-polkadot-pink text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5", children: i + 1 }), _jsx("span", { className: "text-[10px] text-gray-500 leading-relaxed", children: step })] }, i))) })] }), _jsx("button", { onClick: onNavigateHome, className: "w-full py-3 rounded-xl bg-polkadot-pink hover:bg-pink-600 text-white font-bold text-xs uppercase tracking-widest transition-all shadow-[0_0_12px_rgba(230,0,122,0.2)]", children: "Go to Score Page \u2192" })] }));
}
// ── Main ───────────────────────────────────────────────────────────────────────
export function CreateWallet({ onNavigateHome }) {
    const [step, setStep] = useState(1);
    const [wallet, setWallet] = useState(null);
    const handleGenerate = useCallback((w) => {
        setWallet(w);
        setStep(2);
    }, []);
    return (_jsxs("div", { className: "max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-xl font-black tracking-tight text-white", children: ["Create ", _jsx("span", { className: "text-polkadot-pink", children: "Wallet" })] }), _jsx("p", { className: "text-[10px] text-gray-600 mt-0.5 font-medium", children: "Client-side \u00B7 BIP39 \u00B7 MetaMask-ready" })] }), _jsx(StepDots, { step: step })] }), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden shadow-xl", children: [_jsx("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20 flex items-center gap-2", children: [
                            [1, 'Generate'],
                            [2, 'Seed Phrase'],
                            [3, 'MetaMask'],
                            [4, 'Fund & Score'],
                        ].map(([s, label]) => (_jsx("span", { className: `text-[9px] font-black uppercase tracking-widest ${step === s ? 'text-polkadot-pink' : step > s ? 'text-gray-600' : 'text-gray-800'}`, children: step === s ? `● ${label}` : step > s ? `✓` : `○` }, s))) }), _jsxs("div", { className: "px-4 py-4", children: [step === 1 && _jsx(Step1, { onGenerate: handleGenerate }), step === 2 && wallet && _jsx(Step2, { wallet: wallet, onNext: () => setStep(3) }), step === 3 && wallet && _jsx(Step3, { wallet: wallet, onNext: () => setStep(4) }), step === 4 && wallet && _jsx(Step4, { wallet: wallet, onNavigateHome: onNavigateHome }), step > 1 && step < 4 && (_jsx("button", { onClick: () => setStep(s => (s - 1)), className: "mt-4 w-full py-2.5 rounded-xl border border-white/5 text-gray-700 hover:text-gray-500 text-xs font-bold uppercase tracking-widest transition-all", children: "\u2190 Back" }))] })] }), _jsx("p", { className: "text-center text-[9px] text-gray-700", children: "Keys generated locally \u00B7 Never transmitted \u00B7 Open source" })] }));
}
