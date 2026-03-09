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
const CHAIN_ID = '0x18F432A1'; // 420420417 hex
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
    return (_jsx("button", { onClick: copy, className: "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition-all", children: copied ? (_jsxs(_Fragment, { children: [_jsx("svg", { className: "w-3.5 h-3.5 text-green-400", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M5 13l4 4L19 7" }) }), _jsx("span", { className: "text-green-400", children: "Copied!" })] })) : (_jsxs(_Fragment, { children: [_jsx("svg", { className: "w-3.5 h-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" }) }), _jsx("span", { children: label })] })) }));
}
function StepDots({ step }) {
    return (_jsx("div", { className: "flex items-center gap-2 mb-8", children: [1, 2, 3, 4].map(s => (_jsx("div", { className: `h-1.5 rounded-full transition-all duration-300 ${s === step ? 'w-6 bg-polkadot-pink' : s < step ? 'w-3 bg-polkadot-pink/40' : 'w-3 bg-white/10'}` }, s))) }));
}
// ── Step 1 ── Generate ─────────────────────────────────────────────────────────
function Step1({ onGenerate }) {
    const [loading, setLoading] = useState(false);
    const generate = useCallback(() => {
        setLoading(true);
        setTimeout(() => {
            const mnemonic = generateMnemonic(wordlist, 128); // 12 words
            onGenerate(deriveWallet(mnemonic));
            setLoading(false);
        }, 300);
    }, [onGenerate]);
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-bold text-white mb-2", children: "Create a New Wallet" }), _jsx("p", { className: "text-gray-400 text-sm leading-relaxed", children: "Generate a fresh Polkadot Hub wallet \u2014 fully in your browser, never sent anywhere. You'll get a seed phrase and private key to import into MetaMask." })] }), _jsx("div", { className: "grid grid-cols-1 gap-3", children: [
                    { icon: '🔑', title: '12-word seed phrase', desc: 'Standard BIP39 — works with any wallet' },
                    { icon: '🦊', title: 'MetaMask-ready', desc: 'Import via private key in seconds' },
                    { icon: '🔒', title: '100% client-side', desc: 'Nothing leaves your browser' },
                ].map(({ icon, title, desc }) => (_jsxs("div", { className: "flex items-start gap-3 bg-white/3 rounded-xl px-4 py-3 border border-white/5", children: [_jsx("span", { className: "text-lg mt-0.5", children: icon }), _jsxs("div", { children: [_jsx("div", { className: "text-sm font-medium text-white", children: title }), _jsx("div", { className: "text-xs text-gray-500", children: desc })] })] }, title))) }), _jsxs("div", { className: "flex gap-3 bg-amber-950/50 border border-amber-500/30 rounded-xl px-4 py-3", children: [_jsx("span", { className: "text-amber-400 text-base shrink-0", children: "\u26A0" }), _jsx("p", { className: "text-xs text-amber-300/80 leading-relaxed", children: "You will be shown a seed phrase. Write it down on paper and store it safely. Anyone with your seed phrase has full access to your funds." })] }), _jsx("button", { onClick: generate, disabled: loading, className: "w-full py-3.5 rounded-xl bg-polkadot-pink hover:bg-polkadot-pink/90 disabled:opacity-60 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2", children: loading ? (_jsxs(_Fragment, { children: [_jsxs("svg", { className: "w-4 h-4 animate-spin", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8v8z" })] }), "Generating\u2026"] })) : (_jsxs(_Fragment, { children: [_jsx("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M12 4v16m8-8H4" }) }), "Generate Wallet"] })) }), _jsxs("p", { className: "text-center text-xs text-gray-600", children: ["Already have a wallet?", ' ', _jsx("a", { href: "#", className: "text-polkadot-pink hover:underline", onClick: e => { e.preventDefault(); window.dispatchEvent(new CustomEvent('vs:navigate', { detail: 'home' })); }, children: "Go to Score \u2192" })] })] }));
}
// ── Step 2 ── Seed phrase ──────────────────────────────────────────────────────
function Step2({ wallet, onNext }) {
    const [revealed, setRevealed] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const words = wallet.mnemonic.split(' ');
    return (_jsxs("div", { className: "space-y-5", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-bold text-white mb-2", children: "Save Your Seed Phrase" }), _jsx("p", { className: "text-gray-400 text-sm leading-relaxed", children: "Write these 12 words down in order. This is the only way to recover your wallet." })] }), _jsxs("div", { className: "relative", children: [_jsx("div", { className: `grid grid-cols-3 gap-2 transition-all duration-300 ${!revealed ? 'blur-md select-none pointer-events-none' : ''}`, children: words.map((word, i) => (_jsxs("div", { className: "flex items-center gap-2 bg-polkadot-dark border border-polkadot-border rounded-lg px-3 py-2", children: [_jsx("span", { className: "text-[10px] text-gray-600 w-4 shrink-0 text-right", children: i + 1 }), _jsx("span", { className: "text-sm font-mono text-white font-medium", children: word })] }, i))) }), !revealed && (_jsx("div", { className: "absolute inset-0 flex items-center justify-center", children: _jsxs("button", { onClick: () => setRevealed(true), className: "flex items-center gap-2 bg-polkadot-card border border-polkadot-border rounded-xl px-5 py-3 text-sm font-medium text-white hover:border-polkadot-pink/50 transition-all shadow-xl", children: [_jsxs("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: [_jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M15 12a3 3 0 11-6 0 3 3 0 016 0z" }), _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" })] }), "Reveal Seed Phrase"] }) }))] }), revealed && (_jsx("div", { className: "flex justify-end", children: _jsx(CopyButton, { text: wallet.mnemonic, label: "Copy all words" }) })), _jsxs("div", { className: "flex gap-3 bg-red-950/40 border border-red-500/30 rounded-xl px-4 py-3", children: [_jsx("span", { className: "text-red-400 text-base shrink-0 mt-0.5", children: "\u2717" }), _jsx("p", { className: "text-xs text-red-300/80 leading-relaxed", children: "Never share your seed phrase with anyone. VeraScore will never ask for it. Store it offline \u2014 not in screenshots, cloud storage, or messages." })] }), _jsxs("label", { className: "flex items-start gap-3 cursor-pointer group", children: [_jsx("div", { onClick: () => setConfirmed(c => !c), className: `mt-0.5 w-4 h-4 rounded shrink-0 border-2 flex items-center justify-center transition-all ${confirmed ? 'bg-polkadot-pink border-polkadot-pink' : 'border-gray-600 group-hover:border-gray-400'}`, children: confirmed && _jsx("svg", { className: "w-2.5 h-2.5 text-white", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 3, d: "M5 13l4 4L19 7" }) }) }), _jsx("span", { className: "text-sm text-gray-400 group-hover:text-gray-300 transition-colors select-none", children: "I have written down my seed phrase and stored it safely" })] }), _jsx("button", { onClick: onNext, disabled: !confirmed || !revealed, className: "w-full py-3.5 rounded-xl bg-polkadot-pink hover:bg-polkadot-pink/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all", children: "Continue to MetaMask Import \u2192" })] }));
}
// ── Step 3 ── MetaMask import ──────────────────────────────────────────────────
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
                params: [{
                        chainId: CHAIN_ID,
                        chainName: CHAIN_NAME,
                        rpcUrls: [RPC_URL],
                        nativeCurrency: { name: 'PAS', symbol: 'PAS', decimals: 18 },
                        blockExplorerUrls: [EXPLORER],
                    }],
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
            await window.ethereum.request({
                method: 'wallet_importAccount',
                params: [wallet.privateKey],
            });
        }
        catch {
            // wallet_importAccount is not widely supported — show manual instructions
            setShowKey(true);
        }
    };
    return (_jsxs("div", { className: "space-y-5", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-bold text-white mb-2", children: "Import to MetaMask" }), _jsx("p", { className: "text-gray-400 text-sm leading-relaxed", children: "Add the Polkadot Hub TestNet network, then import your private key to use VeraScore." })] }), _jsxs("div", { className: "bg-polkadot-dark border border-polkadot-border rounded-xl p-4 space-y-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: `w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${netAdded ? 'bg-green-500' : 'bg-polkadot-pink'}`, children: netAdded ? '✓' : '1' }), _jsx("span", { className: "text-sm font-medium text-white", children: "Add Polkadot Hub TestNet" })] }), netAdded && _jsx("span", { className: "text-xs text-green-400", children: "Added \u2713" })] }), !netAdded && (_jsx("button", { onClick: addNetwork, disabled: adding, className: "w-full py-2.5 rounded-lg bg-polkadot-pink/15 hover:bg-polkadot-pink/25 border border-polkadot-pink/30 text-polkadot-pink text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-60", children: adding ? _jsxs(_Fragment, { children: [_jsxs("svg", { className: "w-3.5 h-3.5 animate-spin", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8v8z" })] }), "Adding\u2026"] }) : '🦊 Add to MetaMask' }))] }), _jsxs("div", { className: "bg-polkadot-dark border border-polkadot-border rounded-xl p-4 space-y-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "w-5 h-5 rounded-full bg-polkadot-pink flex items-center justify-center text-xs font-bold shrink-0", children: "2" }), _jsx("span", { className: "text-sm font-medium text-white", children: "Import Account via Private Key" })] }), _jsx("p", { className: "text-xs text-gray-500", children: "Open MetaMask \u2192 Account selector \u2192 Add account \u2192 Import account \u2192 paste your private key." }), _jsxs("div", { className: "relative", children: [_jsx("div", { className: `font-mono text-xs break-all px-3 py-2.5 rounded-lg bg-black/40 border border-white/5 text-gray-300 transition-all ${!showKey ? 'blur-sm select-none' : ''}`, children: wallet.privateKey }), !showKey && (_jsx("div", { className: "absolute inset-0 flex items-center justify-center", children: _jsxs("button", { onClick: () => setShowKey(true), className: "flex items-center gap-1.5 bg-polkadot-card border border-polkadot-border rounded-lg px-3 py-1.5 text-xs text-white hover:border-polkadot-pink/40 transition-all", children: [_jsxs("svg", { className: "w-3.5 h-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: [_jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M15 12a3 3 0 11-6 0 3 3 0 016 0z" }), _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" })] }), "Reveal private key"] }) }))] }), showKey && (_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("p", { className: "text-[10px] text-red-400", children: "\u26A0 Never share this key" }), _jsx(CopyButton, { text: wallet.privateKey, label: "Copy key" })] }))] }), _jsxs("div", { className: "bg-polkadot-dark border border-polkadot-border rounded-xl p-4 space-y-2", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-xs text-gray-500 uppercase tracking-wider", children: "Your EVM Address" }), _jsx(CopyButton, { text: wallet.address, label: "Copy address" })] }), _jsx("p", { className: "font-mono text-sm text-white break-all", children: wallet.address })] }), _jsx("button", { onClick: onNext, className: "w-full py-3.5 rounded-xl bg-polkadot-pink hover:bg-polkadot-pink/90 text-white font-semibold text-sm transition-all", children: "Continue to Fund Wallet \u2192" })] }));
}
// ── Step 4 ── Fund & Score ─────────────────────────────────────────────────────
function Step4({ wallet, onNavigateHome }) {
    return (_jsxs("div", { className: "space-y-5", children: [_jsxs("div", { children: [_jsx("div", { className: "w-12 h-12 rounded-2xl bg-green-500/15 border border-green-500/30 flex items-center justify-center text-2xl mb-4", children: "\u2713" }), _jsx("h2", { className: "text-2xl font-bold text-white mb-2", children: "Wallet Ready!" }), _jsx("p", { className: "text-gray-400 text-sm leading-relaxed", children: "Fund your wallet with PAS from the faucet, then come back to get your credit score." })] }), _jsxs("div", { className: "bg-polkadot-dark border border-polkadot-border rounded-xl p-4 space-y-2", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-xs text-gray-500 uppercase tracking-wider", children: "Your Address" }), _jsx(CopyButton, { text: wallet.address, label: "Copy" })] }), _jsx("p", { className: "font-mono text-xs text-white break-all", children: wallet.address })] }), _jsxs("a", { href: FAUCET_URL, target: "_blank", rel: "noopener noreferrer", className: "flex items-center justify-between w-full bg-polkadot-dark hover:bg-white/5 border border-polkadot-border hover:border-polkadot-pink/40 rounded-xl p-4 transition-all group", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "text-2xl", children: "\uD83D\uDEB0" }), _jsxs("div", { className: "text-left", children: [_jsx("div", { className: "text-sm font-medium text-white", children: "Get PAS from Faucet" }), _jsx("div", { className: "text-xs text-gray-500", children: "faucet.polkadot.io \u2014 free testnet tokens" })] })] }), _jsx("svg", { className: "w-4 h-4 text-gray-600 group-hover:text-polkadot-pink transition-colors", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" }) })] }), _jsxs("a", { href: `${EXPLORER}/address/${wallet.address}`, target: "_blank", rel: "noopener noreferrer", className: "flex items-center justify-between w-full bg-polkadot-dark hover:bg-white/5 border border-polkadot-border hover:border-white/20 rounded-xl p-4 transition-all group", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "text-2xl", children: "\uD83D\uDD0D" }), _jsxs("div", { className: "text-left", children: [_jsx("div", { className: "text-sm font-medium text-white", children: "View on Routescan" }), _jsx("div", { className: "text-xs text-gray-500", children: "Track your balance and transactions" })] })] }), _jsx("svg", { className: "w-4 h-4 text-gray-600 group-hover:text-white transition-colors", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" }) })] }), _jsxs("div", { className: "bg-polkadot-dark border border-polkadot-border rounded-xl p-4 space-y-2", children: [_jsx("p", { className: "text-xs text-gray-500 uppercase tracking-wider mb-3", children: "What's next" }), [
                        'Paste your address in the faucet and request PAS',
                        'Import the private key into MetaMask',
                        'Connect MetaMask on the Score page',
                        'Get your AI credit score minted on-chain',
                    ].map((step, i) => (_jsxs("div", { className: "flex items-start gap-2.5", children: [_jsx("span", { className: "w-4 h-4 rounded-full bg-polkadot-pink/20 border border-polkadot-pink/40 text-polkadot-pink text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold", children: i + 1 }), _jsx("span", { className: "text-xs text-gray-400", children: step })] }, i)))] }), _jsxs("button", { onClick: onNavigateHome, className: "w-full py-3.5 rounded-xl bg-polkadot-pink hover:bg-polkadot-pink/90 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2", children: [_jsx("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M13 7l5 5m0 0l-5 5m5-5H6" }) }), "Go to Score Page"] })] }));
}
// ── Main export ────────────────────────────────────────────────────────────────
export function CreateWallet({ onNavigateHome }) {
    const [step, setStep] = useState(1);
    const [wallet, setWallet] = useState(null);
    const handleGenerate = useCallback((w) => {
        setWallet(w);
        setStep(2);
    }, []);
    return (_jsx("div", { className: "h-full overflow-y-auto", children: _jsxs("div", { className: "max-w-lg mx-auto px-6 py-8", children: [_jsxs("div", { className: "mb-6", children: [_jsx("div", { className: "text-xs text-gray-600 uppercase tracking-widest mb-1", children: "VeraScore" }), _jsx(StepDots, { step: step })] }), step === 1 && (_jsx(Step1, { onGenerate: handleGenerate })), step === 2 && wallet && (_jsx(Step2, { wallet: wallet, onNext: () => setStep(3) })), step === 3 && wallet && (_jsx(Step3, { wallet: wallet, onNext: () => setStep(4) })), step === 4 && wallet && (_jsx(Step4, { wallet: wallet, onNavigateHome: onNavigateHome })), step > 1 && step < 4 && (_jsx("button", { onClick: () => setStep(s => (s - 1)), className: "mt-4 w-full py-2.5 rounded-xl border border-white/5 text-gray-600 hover:text-gray-400 text-sm transition-all", children: "\u2190 Back" })), _jsx("p", { className: "text-center text-[10px] text-gray-700 mt-6", children: "Keys generated locally \u00B7 Never transmitted \u00B7 Open source" })] }) }));
}
