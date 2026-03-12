'use client';

import { useState, useCallback } from 'react';
import { generateMnemonic }   from '@scure/bip39';
import { wordlist }            from '@scure/bip39/wordlists/english';
import { mnemonicToSeedSync }  from '@scure/bip39';
import { HDKey }               from '@scure/bip32';
import { privateKeyToAccount } from 'viem/accounts';
import { bytesToHex }          from 'viem';

const FAUCET_URL = 'https://faucet.polkadot.io/?parachain=1111';
const CHAIN_ID   = '0x18F432A1';
const CHAIN_NAME = 'Polkadot Hub TestNet';
const RPC_URL    = 'https://services.polkadothub-rpc.com/testnet';
const EXPLORER   = 'https://polkadot.testnet.routescan.io';

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
    <button onClick={copy}
      className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-500 hover:text-white transition-all">
      {copied ? (
        <><span className="text-emerald-400">✓</span><span className="text-emerald-400">Copied</span></>
      ) : (
        <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg><span>{label}</span></>
      )}
    </button>
  );
}

function StepDots({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-1.5">
      {([1, 2, 3, 4] as Step[]).map(s => (
        <div key={s} className={`h-1 rounded-full transition-all duration-300 ${
          s === step ? 'w-5 bg-polkadot-pink' : s < step ? 'w-2.5 bg-polkadot-pink/40' : 'w-2.5 bg-white/10'
        }`} />
      ))}
    </div>
  );
}

// ── Step 1 ─────────────────────────────────────────────────────────────────────
function Step1({ onGenerate }: { onGenerate: (w: WalletData) => void }) {
  const [loading, setLoading] = useState(false);

  const generate = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      const mnemonic = generateMnemonic(wordlist, 128);
      onGenerate(deriveWallet(mnemonic));
      setLoading(false);
    }, 300);
  }, [onGenerate]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-black uppercase tracking-tight text-white">Create a New Wallet</h2>
        <p className="text-[10px] text-gray-600 mt-1 leading-relaxed">
          Generate a fresh Polkadot Hub wallet — fully in your browser, never sent anywhere.
          You'll get a seed phrase and private key to import into MetaMask.
        </p>
      </div>

      <div className="space-y-1.5">
        {[
          ['→', '12-word seed phrase', 'Standard BIP39 — works with any wallet'],
          ['→', 'MetaMask-ready',      'Import via private key in seconds'],
          ['→', '100% client-side',   'Nothing leaves your browser'],
        ].map(([icon, title, desc]) => (
          <div key={title} className="flex items-start gap-2.5 bg-white/[0.02] rounded-xl px-3 py-2.5 border border-white/5">
            <span className="text-polkadot-pink font-black text-[9px] mt-0.5 shrink-0">{icon}</span>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-white">{title}</div>
              <div className="text-[9px] text-gray-600 mt-0.5">{desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2.5 bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2.5">
        <span className="text-amber-400 text-[10px] shrink-0 font-black">⚠</span>
        <p className="text-[9px] text-amber-300/80 leading-relaxed">
          You will be shown a seed phrase. Write it down on paper and store it safely.
          Anyone with your seed phrase has full access to your funds.
        </p>
      </div>

      <button onClick={generate} disabled={loading}
        className="w-full py-3 rounded-xl bg-polkadot-pink hover:bg-pink-600 disabled:opacity-60 text-white font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-[0_0_12px_rgba(230,0,122,0.2)]">
        {loading ? (
          <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Generating…</>
        ) : 'Generate Wallet'}
      </button>

      <p className="text-center text-[9px] text-gray-700">
        Already have a wallet?{' '}
        <a href="#" className="text-polkadot-pink hover:underline"
          onClick={e => { e.preventDefault(); window.dispatchEvent(new CustomEvent('vs:navigate', { detail: 'home' })); }}>
          Go to Score →
        </a>
      </p>
    </div>
  );
}

// ── Step 2 ─────────────────────────────────────────────────────────────────────
function Step2({ wallet, onNext }: { wallet: WalletData; onNext: () => void }) {
  const [revealed,  setRevealed]  = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const words = wallet.mnemonic.split(' ');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-black uppercase tracking-tight text-white">Save Your Seed Phrase</h2>
        <p className="text-[10px] text-gray-600 mt-1 leading-relaxed">
          Write these 12 words down in order. This is the only way to recover your wallet.
        </p>
      </div>

      {/* Word grid */}
      <div className="relative">
        <div className={`grid grid-cols-3 gap-1.5 transition-all duration-300 ${!revealed ? 'blur-md select-none pointer-events-none' : ''}`}>
          {words.map((word, i) => (
            <div key={i} className="flex items-center gap-2 bg-polkadot-card border border-polkadot-border rounded-lg px-2.5 py-1.5">
              <span className="text-[8px] text-gray-700 w-3 shrink-0 text-right">{i + 1}</span>
              <span className="text-xs font-mono text-white font-medium">{word}</span>
            </div>
          ))}
        </div>
        {!revealed && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button onClick={() => setRevealed(true)}
              className="flex items-center gap-1.5 bg-polkadot-card border border-polkadot-border rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:border-polkadot-pink/50 transition-all shadow-xl">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              Reveal
            </button>
          </div>
        )}
      </div>

      {revealed && (
        <div className="flex justify-end">
          <CopyButton text={wallet.mnemonic} label="Copy all words" />
        </div>
      )}

      <div className="flex gap-2.5 bg-red-500/5 border border-red-500/20 rounded-xl px-3 py-2.5">
        <span className="text-red-400 text-[9px] shrink-0 font-black mt-0.5">✗</span>
        <p className="text-[9px] text-red-300/80 leading-relaxed">
          Never share your seed phrase with anyone. VeraScore will never ask for it.
          Store it offline — not in screenshots, cloud storage, or messages.
        </p>
      </div>

      <label className="flex items-start gap-2.5 cursor-pointer group">
        <div onClick={() => setConfirmed(c => !c)}
          className={`mt-0.5 w-4 h-4 rounded shrink-0 border-2 flex items-center justify-center transition-all ${
            confirmed ? 'bg-polkadot-pink border-polkadot-pink' : 'border-gray-600 group-hover:border-gray-400'
          }`}>
          {confirmed && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
        </div>
        <span className="text-xs text-gray-500 group-hover:text-gray-400 transition-colors select-none">
          I have written down my seed phrase and stored it safely
        </span>
      </label>

      <button onClick={onNext} disabled={!confirmed || !revealed}
        className="w-full py-3 rounded-xl bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-widest transition-all">
        Continue to MetaMask Import →
      </button>
    </div>
  );
}

// ── Step 3 ─────────────────────────────────────────────────────────────────────
function Step3({ wallet, onNext }: { wallet: WalletData; onNext: () => void }) {
  const [showKey,  setShowKey]  = useState(false);
  const [adding,   setAdding]   = useState(false);
  const [netAdded, setNetAdded] = useState(false);

  const addNetwork = async () => {
    if (!window.ethereum) return;
    setAdding(true);
    try {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{ chainId: CHAIN_ID, chainName: CHAIN_NAME, rpcUrls: [RPC_URL],
          nativeCurrency: { name: 'PAS', symbol: 'PAS', decimals: 18 },
          blockExplorerUrls: [EXPLORER] }],
      });
      setNetAdded(true);
    } catch { /* user rejected */ }
    setAdding(false);
  };

  const importToMetaMask = async () => {
    if (!window.ethereum) return;
    try {
      await (window.ethereum as any).request({ method: 'wallet_importAccount', params: [wallet.privateKey] });
    } catch { setShowKey(true); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-black uppercase tracking-tight text-white">Import to MetaMask</h2>
        <p className="text-[10px] text-gray-600 mt-1 leading-relaxed">
          Add Polkadot Hub TestNet to MetaMask, then import your private key.
        </p>
      </div>

      {/* Step A — add network */}
      <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-polkadot-border bg-black/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${netAdded ? 'bg-emerald-500' : 'bg-polkadot-pink'}`}>
              {netAdded ? '✓' : '1'}
            </span>
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Add Network</span>
          </div>
          {netAdded && <span className="text-[9px] font-bold text-emerald-400">Added ✓</span>}
        </div>
        {!netAdded && (
          <div className="px-4 py-3">
            <button onClick={addNetwork} disabled={adding}
              className="w-full py-2.5 rounded-xl bg-polkadot-pink/10 hover:bg-polkadot-pink/20 border border-polkadot-pink/30 text-polkadot-pink text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-60">
              {adding ? <><span className="w-3 h-3 border-2 border-pink-400/30 border-t-pink-400 rounded-full animate-spin" />Adding…</> : '🦊 Add to MetaMask'}
            </button>
          </div>
        )}
      </div>

      {/* Step B — private key */}
      <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-polkadot-border bg-black/20 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-polkadot-pink flex items-center justify-center text-[10px] font-black shrink-0">2</span>
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Import Private Key</span>
        </div>
        <div className="px-4 py-3 space-y-2.5">
          <p className="text-[9px] text-gray-600 leading-relaxed">
            MetaMask → Account selector → Add account → Import account → paste key.
          </p>
          <div className="relative">
            <div className={`font-mono text-[10px] break-all px-3 py-2.5 rounded-xl bg-black/40 border border-white/5 text-gray-400 transition-all ${!showKey ? 'blur-sm select-none' : ''}`}>
              {wallet.privateKey}
            </div>
            {!showKey && (
              <div className="absolute inset-0 flex items-center justify-center">
                <button onClick={() => setShowKey(true)}
                  className="flex items-center gap-1.5 bg-polkadot-card border border-polkadot-border rounded-lg px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white hover:border-polkadot-pink/40 transition-all">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  Reveal
                </button>
              </div>
            )}
          </div>
          {showKey && (
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-bold text-red-400">⚠ Never share this key</p>
              <CopyButton text={wallet.privateKey} label="Copy key" />
            </div>
          )}
        </div>
      </div>

      {/* Address */}
      <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-polkadot-border bg-black/20 flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Your EVM Address</span>
          <CopyButton text={wallet.address} label="Copy" />
        </div>
        <div className="px-4 py-3">
          <p className="font-mono text-xs text-white break-all">{wallet.address}</p>
        </div>
      </div>

      <button onClick={onNext}
        className="w-full py-3 rounded-xl bg-polkadot-pink hover:bg-pink-600 text-white font-bold text-xs uppercase tracking-widest transition-all">
        Continue to Fund Wallet →
      </button>
    </div>
  );
}

// ── Step 4 ─────────────────────────────────────────────────────────────────────
function Step4({ wallet, onNavigateHome }: { wallet: WalletData; onNavigateHome: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-base shrink-0">✓</div>
        <div>
          <h2 className="text-base font-black uppercase tracking-tight text-white">Wallet Ready!</h2>
          <p className="text-[9px] text-gray-600 mt-0.5">Fund with PAS then get your credit score.</p>
        </div>
      </div>

      {/* Address */}
      <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-polkadot-border bg-black/20 flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Your Address</span>
          <CopyButton text={wallet.address} label="Copy" />
        </div>
        <div className="px-4 py-3">
          <p className="font-mono text-[10px] text-white break-all">{wallet.address}</p>
        </div>
      </div>

      {/* Links */}
      <div className="grid grid-cols-1 gap-2">
        {[
          { href: FAUCET_URL, icon: '🚰', title: 'Get PAS from Faucet', sub: 'faucet.polkadot.io — free testnet tokens' },
          { href: `${EXPLORER}/address/${wallet.address}`, icon: '🔍', title: 'View on Routescan', sub: 'Track balance and transactions' },
        ].map(({ href, icon, title, sub }) => (
          <a key={href} href={href} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-between bg-polkadot-card hover:bg-white/5 border border-polkadot-border hover:border-polkadot-pink/30 rounded-xl px-4 py-3 transition-all group">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">{icon}</span>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-white">{title}</div>
                <div className="text-[9px] text-gray-600">{sub}</div>
              </div>
            </div>
            <svg className="w-3.5 h-3.5 text-gray-700 group-hover:text-polkadot-pink transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
          </a>
        ))}
      </div>

      {/* What's next */}
      <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-polkadot-border bg-black/20">
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">What's Next</span>
        </div>
        <div className="px-4 py-3 space-y-2">
          {[
            'Paste your address in the faucet and request PAS',
            'Import the private key into MetaMask',
            'Connect MetaMask on the Score page',
            'Get your AI credit score minted on-chain',
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="w-4 h-4 rounded-full bg-polkadot-pink/15 border border-polkadot-pink/30 text-polkadot-pink text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span className="text-[10px] text-gray-500 leading-relaxed">{step}</span>
            </div>
          ))}
        </div>
      </div>

      <button onClick={onNavigateHome}
        className="w-full py-3 rounded-xl bg-polkadot-pink hover:bg-pink-600 text-white font-bold text-xs uppercase tracking-widest transition-all shadow-[0_0_12px_rgba(230,0,122,0.2)]">
        Go to Score Page →
      </button>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export function CreateWallet({ onNavigateHome }: { onNavigateHome: () => void }) {
  const [step,   setStep]   = useState<Step>(1);
  const [wallet, setWallet] = useState<WalletData | null>(null);

  const handleGenerate = useCallback((w: WalletData) => {
    setWallet(w);
    setStep(2);
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black tracking-tight text-white">
            Create <span className="text-polkadot-pink">Wallet</span>
          </h1>
          <p className="text-[10px] text-gray-600 mt-0.5 font-medium">Client-side · BIP39 · MetaMask-ready</p>
        </div>
        <StepDots step={step} />
      </div>

      {/* Step card */}
      <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden shadow-xl">
        <div className="px-4 py-3 border-b border-polkadot-border bg-black/20 flex items-center gap-2">
          {([
            [1, 'Generate'],
            [2, 'Seed Phrase'],
            [3, 'MetaMask'],
            [4, 'Fund & Score'],
          ] as [number, string][]).map(([s, label]) => (
            <span key={s} className={`text-[9px] font-black uppercase tracking-widest ${step === s ? 'text-polkadot-pink' : step > s ? 'text-gray-600' : 'text-gray-800'}`}>
              {step === s ? `● ${label}` : step > s ? `✓` : `○`}
            </span>
          ))}
        </div>
        <div className="px-4 py-4">
          {step === 1 && <Step1 onGenerate={handleGenerate} />}
          {step === 2 && wallet && <Step2 wallet={wallet} onNext={() => setStep(3)} />}
          {step === 3 && wallet && <Step3 wallet={wallet} onNext={() => setStep(4)} />}
          {step === 4 && wallet && <Step4 wallet={wallet} onNavigateHome={onNavigateHome} />}

          {step > 1 && step < 4 && (
            <button onClick={() => setStep(s => (s - 1) as Step)}
              className="mt-4 w-full py-2.5 rounded-xl border border-white/5 text-gray-700 hover:text-gray-500 text-xs font-bold uppercase tracking-widest transition-all">
              ← Back
            </button>
          )}
        </div>
      </div>

      <p className="text-center text-[9px] text-gray-700">
        Keys generated locally · Never transmitted · Open source
      </p>
    </div>
  );
}