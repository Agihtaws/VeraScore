'use client';

import { useState, useCallback } from 'react';
import { generateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { privateKeyToAccount } from 'viem/accounts';
import { bytesToHex } from 'viem';

// Updated to the fast RPC and correct Paseo Faucet pa!
const FAUCET_URL  = 'https://faucet.polkadot.io/paseo-asset-hub';
const CHAIN_ID    = '0x190f23a1'; // 420420417 hex
const CHAIN_NAME  = 'Polkadot Hub TestNet';
const RPC_URL     = 'https://pas-rpc.stakeworld.io/assethub';
const EXPLORER    = 'https://polkadot.testnet.routescan.io';

type Step = 1 | 2 | 3 | 4;

interface WalletData {
  mnemonic:   string;
  privateKey: `0x${string}`;
  address:    `0x${string}`;
}

function deriveWallet(mnemonic: string): WalletData {
  const seed       = mnemonicToSeedSync(mnemonic);
  const hdKey      = HDKey.fromMasterSeed(seed);
  const child      = hdKey.derive("m/44'/60'/0'/0/0");
  const privateKey = bytesToHex(child.privateKey!) as `0x${string}`;
  const account    = privateKeyToAccount(privateKey);
  return { mnemonic, privateKey, address: account.address };
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-2 text-[10px] font-black uppercase px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white transition-all tracking-widest"
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}

// ── Step 1: Generate ──
function Step1({ onGenerate }: { onGenerate: (w: WalletData) => void }) {
  const [loading, setLoading] = useState(false);

  const generate = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      const mnemonic = generateMnemonic(wordlist, 128);
      onGenerate(deriveWallet(mnemonic));
      setLoading(false);
    }, 500);
  }, [onGenerate]);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-3xl font-black uppercase italic tracking-tighter text-white">Create <span className="text-polkadot-pink">Identity</span></h2>
        <p className="text-gray-500 text-xs font-medium uppercase tracking-widest leading-relaxed">
          Zero-Knowledge Generation · Client-Side Only
        </p>
      </div>

      <div className="space-y-3">
        {[
          { icon: '🔑', title: '12-WORD SEED', desc: 'Standard BIP39 Recovery Phrase' },
          { icon: '🦊', title: 'METAMASK READY', desc: 'Instant Private Key Import' },
          { icon: '🛡️', title: 'SECURE', desc: 'Keys never leave your local memory' },
        ].map((item) => (
          <div key={item.title} className="bg-polkadot-dark border border-polkadot-border rounded-2xl p-4 flex items-center gap-4">
            <span className="text-2xl">{item.icon}</span>
            <div>
              <div className="text-[10px] font-black text-white uppercase tracking-widest">{item.title}</div>
              <div className="text-[10px] text-gray-600 font-bold uppercase tracking-tighter">{item.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={generate}
        disabled={loading}
        className="w-full py-5 rounded-2xl bg-polkadot-pink hover:bg-pink-600 text-white font-black uppercase tracking-widest text-sm shadow-xl shadow-polkadot-pink/20 transition-all active:scale-95"
      >
        {loading ? 'Generating Entropy...' : 'Generate New Wallet'}
      </button>
    </div>
  );
}

// ── Step 2: Seed Phrase ──
function Step2({ wallet, onNext }: { wallet: WalletData; onNext: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const words = wallet.mnemonic.split(' ');

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-3xl font-black uppercase italic tracking-tighter text-white">Save <span className="text-polkadot-pink">Seed</span></h2>
        <p className="text-gray-500 text-xs font-medium uppercase tracking-widest leading-relaxed">
          The only way to recover your credit identity.
        </p>
      </div>

      <div className="relative bg-black/40 border border-polkadot-border rounded-3xl p-6 shadow-inner">
        <div className={`grid grid-cols-3 gap-3 transition-all duration-500 ${!revealed ? 'blur-xl select-none opacity-20' : 'opacity-100'}`}>
          {words.map((word, i) => (
            <div key={i} className="bg-polkadot-dark border border-white/5 rounded-xl px-3 py-3 flex items-center gap-2">
              <span className="text-[8px] font-black text-gray-700">{i + 1}</span>
              <span className="text-xs font-mono font-bold text-white lowercase">{word}</span>
            </div>
          ))}
        </div>
        {!revealed && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button onClick={() => setRevealed(true)} className="bg-white text-black font-black uppercase text-[10px] px-6 py-3 rounded-xl tracking-widest shadow-2xl hover:scale-105 transition-all">Reveal Secret Phrase</button>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center">
         <div className="text-[9px] text-red-500 font-black uppercase tracking-widest">⚠️ DO NOT SHARE</div>
         <CopyButton text={wallet.mnemonic} label="Copy Phrase" />
      </div>

      <button
        onClick={onNext}
        disabled={!revealed}
        className="w-full py-5 rounded-2xl bg-polkadot-pink hover:bg-pink-600 text-white font-black uppercase tracking-widest text-sm shadow-xl disabled:opacity-20"
      >
        I've Secured My Phrase →
      </button>
    </div>
  );
}

// ── Step 3: MetaMask Import ──
function Step3({ wallet, onNext }: { wallet: WalletData; onNext: () => void }) {
  const [showKey, setShowKey] = useState(false);
  const [netAdded, setNetAdded] = useState(false);

  const addNetwork = async () => {
    if (!window.ethereum) return;
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
    } catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-3xl font-black uppercase italic tracking-tighter text-white">Import <span className="text-polkadot-pink">Key</span></h2>
        <p className="text-gray-500 text-xs font-medium uppercase tracking-widest leading-relaxed">
          Link this identity to your browser wallet.
        </p>
      </div>

      <div className="space-y-4">
        <button onClick={addNetwork} className={`w-full py-4 rounded-2xl border font-black uppercase text-[10px] tracking-widest transition-all ${netAdded ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}>
          {netAdded ? '✦ Network Active' : '1. Add Polkadot Hub to MetaMask'}
        </button>

        <div className="bg-polkadot-dark border border-polkadot-border rounded-3xl p-6 space-y-4 shadow-inner">
          <div className="text-[10px] text-gray-600 font-black uppercase tracking-widest">2. Your Private Key</div>
          <div className="relative">
            <div className={`font-mono text-[11px] break-all p-4 rounded-xl bg-black/40 border border-white/5 text-gray-400 transition-all ${!showKey ? 'blur-md select-none' : ''}`}>
              {wallet.privateKey}
            </div>
            {!showKey && (
              <button onClick={() => setShowKey(true)} className="absolute inset-0 text-[10px] font-black uppercase text-polkadot-pink tracking-widest">Reveal Key</button>
            )}
          </div>
          {showKey && <div className="flex justify-end"><CopyButton text={wallet.privateKey} label="Copy Private Key" /></div>}
        </div>
      </div>

      <button onClick={onNext} className="w-full py-5 rounded-2xl bg-polkadot-pink hover:bg-pink-600 text-white font-black uppercase tracking-widest text-sm shadow-xl">
        Ready to Fund →
      </button>
    </div>
  );
}

// ── Step 4: Finalize ──
function Step4({ wallet, onNavigateHome }: { wallet: WalletData; onNavigateHome: () => void }) {
  return (
    <div className="space-y-8 text-center">
      <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl flex items-center justify-center text-4xl mx-auto shadow-2xl shadow-emerald-500/10">✓</div>
      
      <div className="space-y-2">
        <h2 className="text-3xl font-black uppercase italic tracking-tighter text-white">Wallet <span className="text-emerald-400">Active</span></h2>
        <p className="text-gray-500 text-xs font-medium uppercase tracking-widest">Your Substrate identity is ready for scoring.</p>
      </div>

      <div className="bg-polkadot-dark border border-polkadot-border rounded-2xl p-5 space-y-2 text-left shadow-inner">
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-gray-600 font-black uppercase tracking-widest">Public Address</span>
          <CopyButton text={wallet.address} />
        </div>
        <div className="font-mono text-xs text-gray-300 break-all">{wallet.address}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="bg-white/5 hover:bg-white/10 border border-white/10 p-4 rounded-2xl text-center transition-all group">
          <div className="text-2xl mb-1">🚰</div>
          <div className="text-[10px] font-black uppercase text-white tracking-tighter">Get PAS</div>
        </a>
        <a href={`${EXPLORER}/address/${wallet.address}`} target="_blank" rel="noopener noreferrer" className="bg-white/5 hover:bg-white/10 border border-white/10 p-4 rounded-2xl text-center transition-all group">
          <div className="text-2xl mb-1">🔍</div>
          <div className="text-[10px] font-black uppercase text-white tracking-tighter">Explorer</div>
        </a>
      </div>

      <button onClick={onNavigateHome} className="w-full py-5 rounded-2xl bg-polkadot-pink hover:bg-pink-600 text-white font-black uppercase tracking-widest text-sm shadow-xl">
        Enter Protocol Dashboard
      </button>
    </div>
  );
}

export function CreateWallet({ onNavigateHome }: { onNavigateHome: () => void }) {
  const [step, setStep] = useState<Step>(1);
  const [wallet, setWallet] = useState<WalletData | null>(null);

  return (
    <div className="max-w-xl mx-auto px-6 py-12">
      <div className="bg-polkadot-card border border-polkadot-border rounded-[40px] p-10 shadow-2xl space-y-8">
        
        {/* Progress Dots */}
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className={`h-1.5 rounded-full transition-all duration-500 ${s === step ? 'w-12 bg-polkadot-pink' : s < step ? 'w-4 bg-emerald-500' : 'w-4 bg-gray-800'}`} />
          ))}
        </div>

        {step === 1 && <Step1 onGenerate={(w) => { setWallet(w); setStep(2); }} />}
        {step === 2 && wallet && <Step2 wallet={wallet} onNext={() => setStep(3)} />}
        {step === 3 && wallet && <Step3 wallet={wallet} onNext={() => setStep(4)} />}
        {step === 4 && wallet && <Step4 wallet={wallet} onNavigateHome={onNavigateHome} />}

        {step > 1 && step < 4 && (
          <button onClick={() => setStep(s => (s - 1) as Step)} className="w-full text-[10px] font-black uppercase text-gray-700 hover:text-gray-400 transition-colors tracking-[0.2em]">← Back to previous step</button>
        )}
      </div>
      
      <p className="text-center text-[9px] font-black text-gray-800 uppercase tracking-[0.4em] mt-8">
        Secure Entropy · BIP39 Standard · Substrate Native
      </p>
    </div>
  );
}
