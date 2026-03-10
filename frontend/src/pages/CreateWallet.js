'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useCallback } from 'react';
import { generateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { privateKeyToAccount } from 'viem/accounts';
import { bytesToHex } from 'viem';
// Updated to the fast RPC and correct Paseo Faucet pa!
const FAUCET_URL = 'https://faucet.polkadot.io/paseo-asset-hub';
const CHAIN_ID = '0x190f23a1'; // 420420417 hex
const CHAIN_NAME = 'Polkadot Hub TestNet';
const RPC_URL = 'https://pas-rpc.stakeworld.io/assethub';
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
    return (_jsx("button", { onClick: copy, className: "flex items-center gap-2 text-[10px] font-black uppercase px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white transition-all tracking-widest", children: copied ? '✓ Copied' : label }));
}
// ── Step 1: Generate ──
function Step1({ onGenerate }) {
    const [loading, setLoading] = useState(false);
    const generate = useCallback(() => {
        setLoading(true);
        setTimeout(() => {
            const mnemonic = generateMnemonic(wordlist, 128);
            onGenerate(deriveWallet(mnemonic));
            setLoading(false);
        }, 500);
    }, [onGenerate]);
    return (_jsxs("div", { className: "space-y-8", children: [_jsxs("div", { className: "space-y-2", children: [_jsxs("h2", { className: "text-3xl font-black uppercase italic tracking-tighter text-white", children: ["Create ", _jsx("span", { className: "text-polkadot-pink", children: "Identity" })] }), _jsx("p", { className: "text-gray-500 text-xs font-medium uppercase tracking-widest leading-relaxed", children: "Zero-Knowledge Generation \u00B7 Client-Side Only" })] }), _jsx("div", { className: "space-y-3", children: [
                    { icon: '🔑', title: '12-WORD SEED', desc: 'Standard BIP39 Recovery Phrase' },
                    { icon: '🦊', title: 'METAMASK READY', desc: 'Instant Private Key Import' },
                    { icon: '🛡️', title: 'SECURE', desc: 'Keys never leave your local memory' },
                ].map((item) => (_jsxs("div", { className: "bg-polkadot-dark border border-polkadot-border rounded-2xl p-4 flex items-center gap-4", children: [_jsx("span", { className: "text-2xl", children: item.icon }), _jsxs("div", { children: [_jsx("div", { className: "text-[10px] font-black text-white uppercase tracking-widest", children: item.title }), _jsx("div", { className: "text-[10px] text-gray-600 font-bold uppercase tracking-tighter", children: item.desc })] })] }, item.title))) }), _jsx("button", { onClick: generate, disabled: loading, className: "w-full py-5 rounded-2xl bg-polkadot-pink hover:bg-pink-600 text-white font-black uppercase tracking-widest text-sm shadow-xl shadow-polkadot-pink/20 transition-all active:scale-95", children: loading ? 'Generating Entropy...' : 'Generate New Wallet' })] }));
}
// ── Step 2: Seed Phrase ──
function Step2({ wallet, onNext }) {
    const [revealed, setRevealed] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const words = wallet.mnemonic.split(' ');
    return (_jsxs("div", { className: "space-y-8", children: [_jsxs("div", { className: "space-y-2", children: [_jsxs("h2", { className: "text-3xl font-black uppercase italic tracking-tighter text-white", children: ["Save ", _jsx("span", { className: "text-polkadot-pink", children: "Seed" })] }), _jsx("p", { className: "text-gray-500 text-xs font-medium uppercase tracking-widest leading-relaxed", children: "The only way to recover your credit identity." })] }), _jsxs("div", { className: "relative bg-black/40 border border-polkadot-border rounded-3xl p-6 shadow-inner", children: [_jsx("div", { className: `grid grid-cols-3 gap-3 transition-all duration-500 ${!revealed ? 'blur-xl select-none opacity-20' : 'opacity-100'}`, children: words.map((word, i) => (_jsxs("div", { className: "bg-polkadot-dark border border-white/5 rounded-xl px-3 py-3 flex items-center gap-2", children: [_jsx("span", { className: "text-[8px] font-black text-gray-700", children: i + 1 }), _jsx("span", { className: "text-xs font-mono font-bold text-white lowercase", children: word })] }, i))) }), !revealed && (_jsx("div", { className: "absolute inset-0 flex items-center justify-center", children: _jsx("button", { onClick: () => setRevealed(true), className: "bg-white text-black font-black uppercase text-[10px] px-6 py-3 rounded-xl tracking-widest shadow-2xl hover:scale-105 transition-all", children: "Reveal Secret Phrase" }) }))] }), _jsxs("div", { className: "flex justify-between items-center", children: [_jsx("div", { className: "text-[9px] text-red-500 font-black uppercase tracking-widest", children: "\u26A0\uFE0F DO NOT SHARE" }), _jsx(CopyButton, { text: wallet.mnemonic, label: "Copy Phrase" })] }), _jsx("button", { onClick: onNext, disabled: !revealed, className: "w-full py-5 rounded-2xl bg-polkadot-pink hover:bg-pink-600 text-white font-black uppercase tracking-widest text-sm shadow-xl disabled:opacity-20", children: "I've Secured My Phrase \u2192" })] }));
}
// ── Step 3: MetaMask Import ──
function Step3({ wallet, onNext }) {
    const [showKey, setShowKey] = useState(false);
    const [netAdded, setNetAdded] = useState(false);
    const addNetwork = async () => {
        if (!window.ethereum)
            return;
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
        catch (e) {
            console.error(e);
        }
    };
    return (_jsxs("div", { className: "space-y-8", children: [_jsxs("div", { className: "space-y-2", children: [_jsxs("h2", { className: "text-3xl font-black uppercase italic tracking-tighter text-white", children: ["Import ", _jsx("span", { className: "text-polkadot-pink", children: "Key" })] }), _jsx("p", { className: "text-gray-500 text-xs font-medium uppercase tracking-widest leading-relaxed", children: "Link this identity to your browser wallet." })] }), _jsxs("div", { className: "space-y-4", children: [_jsx("button", { onClick: addNetwork, className: `w-full py-4 rounded-2xl border font-black uppercase text-[10px] tracking-widest transition-all ${netAdded ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`, children: netAdded ? '✦ Network Active' : '1. Add Polkadot Hub to MetaMask' }), _jsxs("div", { className: "bg-polkadot-dark border border-polkadot-border rounded-3xl p-6 space-y-4 shadow-inner", children: [_jsx("div", { className: "text-[10px] text-gray-600 font-black uppercase tracking-widest", children: "2. Your Private Key" }), _jsxs("div", { className: "relative", children: [_jsx("div", { className: `font-mono text-[11px] break-all p-4 rounded-xl bg-black/40 border border-white/5 text-gray-400 transition-all ${!showKey ? 'blur-md select-none' : ''}`, children: wallet.privateKey }), !showKey && (_jsx("button", { onClick: () => setShowKey(true), className: "absolute inset-0 text-[10px] font-black uppercase text-polkadot-pink tracking-widest", children: "Reveal Key" }))] }), showKey && _jsx("div", { className: "flex justify-end", children: _jsx(CopyButton, { text: wallet.privateKey, label: "Copy Private Key" }) })] })] }), _jsx("button", { onClick: onNext, className: "w-full py-5 rounded-2xl bg-polkadot-pink hover:bg-pink-600 text-white font-black uppercase tracking-widest text-sm shadow-xl", children: "Ready to Fund \u2192" })] }));
}
// ── Step 4: Finalize ──
function Step4({ wallet, onNavigateHome }) {
    return (_jsxs("div", { className: "space-y-8 text-center", children: [_jsx("div", { className: "w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl flex items-center justify-center text-4xl mx-auto shadow-2xl shadow-emerald-500/10", children: "\u2713" }), _jsxs("div", { className: "space-y-2", children: [_jsxs("h2", { className: "text-3xl font-black uppercase italic tracking-tighter text-white", children: ["Wallet ", _jsx("span", { className: "text-emerald-400", children: "Active" })] }), _jsx("p", { className: "text-gray-500 text-xs font-medium uppercase tracking-widest", children: "Your Substrate identity is ready for scoring." })] }), _jsxs("div", { className: "bg-polkadot-dark border border-polkadot-border rounded-2xl p-5 space-y-2 text-left shadow-inner", children: [_jsxs("div", { className: "flex justify-between items-center", children: [_jsx("span", { className: "text-[10px] text-gray-600 font-black uppercase tracking-widest", children: "Public Address" }), _jsx(CopyButton, { text: wallet.address })] }), _jsx("div", { className: "font-mono text-xs text-gray-300 break-all", children: wallet.address })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("a", { href: FAUCET_URL, target: "_blank", rel: "noopener noreferrer", className: "bg-white/5 hover:bg-white/10 border border-white/10 p-4 rounded-2xl text-center transition-all group", children: [_jsx("div", { className: "text-2xl mb-1", children: "\uD83D\uDEB0" }), _jsx("div", { className: "text-[10px] font-black uppercase text-white tracking-tighter", children: "Get PAS" })] }), _jsxs("a", { href: `${EXPLORER}/address/${wallet.address}`, target: "_blank", rel: "noopener noreferrer", className: "bg-white/5 hover:bg-white/10 border border-white/10 p-4 rounded-2xl text-center transition-all group", children: [_jsx("div", { className: "text-2xl mb-1", children: "\uD83D\uDD0D" }), _jsx("div", { className: "text-[10px] font-black uppercase text-white tracking-tighter", children: "Explorer" })] })] }), _jsx("button", { onClick: onNavigateHome, className: "w-full py-5 rounded-2xl bg-polkadot-pink hover:bg-pink-600 text-white font-black uppercase tracking-widest text-sm shadow-xl", children: "Enter Protocol Dashboard" })] }));
}
export function CreateWallet({ onNavigateHome }) {
    const [step, setStep] = useState(1);
    const [wallet, setWallet] = useState(null);
    return (_jsxs("div", { className: "max-w-xl mx-auto px-6 py-12", children: [_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-[40px] p-10 shadow-2xl space-y-8", children: [_jsx("div", { className: "flex gap-2", children: [1, 2, 3, 4].map(s => (_jsx("div", { className: `h-1.5 rounded-full transition-all duration-500 ${s === step ? 'w-12 bg-polkadot-pink' : s < step ? 'w-4 bg-emerald-500' : 'w-4 bg-gray-800'}` }, s))) }), step === 1 && _jsx(Step1, { onGenerate: (w) => { setWallet(w); setStep(2); } }), step === 2 && wallet && _jsx(Step2, { wallet: wallet, onNext: () => setStep(3) }), step === 3 && wallet && _jsx(Step3, { wallet: wallet, onNext: () => setStep(4) }), step === 4 && wallet && _jsx(Step4, { wallet: wallet, onNavigateHome: onNavigateHome }), step > 1 && step < 4 && (_jsx("button", { onClick: () => setStep(s => (s - 1)), className: "w-full text-[10px] font-black uppercase text-gray-700 hover:text-gray-400 transition-colors tracking-[0.2em]", children: "\u2190 Back to previous step" }))] }), _jsx("p", { className: "text-center text-[9px] font-black text-gray-800 uppercase tracking-[0.4em] mt-8", children: "Secure Entropy \u00B7 BIP39 Standard \u00B7 Substrate Native" })] }));
}
