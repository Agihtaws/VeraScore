'use client';

import { useState, useCallback } from 'react';
import { generateMnemonic }      from '@scure/bip39';
import { wordlist }               from '@scure/bip39/wordlists/english';
import { mnemonicToSeedSync }     from '@scure/bip39';
import { HDKey }                  from '@scure/bip32';
import { privateKeyToAccount }    from 'viem/accounts';
import { bytesToHex }             from 'viem';

const FAUCET_URL  = 'https://faucet.polkadot.io/?parachain=1111';
const CHAIN_ID    = '0x18F432A1'; // 420420417 hex
const CHAIN_NAME  = 'Polkadot Hub TestNet';
const RPC_URL     = 'https://services.polkadothub-rpc.com/testnet';
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
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition-all"
    >
      {copied ? (
        <><svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg><span className="text-green-400">Copied!</span></>
      ) : (
        <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg><span>{label}</span></>
      )}
    </button>
  );
}

function StepDots({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {([1, 2, 3, 4] as Step[]).map(s => (
        <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${
          s === step ? 'w-6 bg-polkadot-pink' : s < step ? 'w-3 bg-polkadot-pink/40' : 'w-3 bg-white/10'
        }`} />
      ))}
    </div>
  );
}

// ── Step 1 ── Generate ─────────────────────────────────────────────────────────
function Step1({ onGenerate }: { onGenerate: (w: WalletData) => void }) {
  const [loading, setLoading] = useState(false);

  const generate = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      const mnemonic = generateMnemonic(wordlist, 128); // 12 words
      onGenerate(deriveWallet(mnemonic));
      setLoading(false);
    }, 300);
  }, [onGenerate]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Create a New Wallet</h2>
        <p className="text-gray-400 text-sm leading-relaxed">
          Generate a fresh Polkadot Hub wallet — fully in your browser, never sent anywhere.
          You'll get a seed phrase and private key to import into MetaMask.
        </p>
      </div>

      {/* What you get */}
      <div className="grid grid-cols-1 gap-3">
        {[
          { icon: '🔑', title: '12-word seed phrase', desc: 'Standard BIP39 — works with any wallet' },
          { icon: '🦊', title: 'MetaMask-ready',       desc: 'Import via private key in seconds'     },
          { icon: '🔒', title: '100% client-side',    desc: 'Nothing leaves your browser'            },
        ].map(({ icon, title, desc }) => (
          <div key={title} className="flex items-start gap-3 bg-white/3 rounded-xl px-4 py-3 border border-white/5">
            <span className="text-lg mt-0.5">{icon}</span>
            <div>
              <div className="text-sm font-medium text-white">{title}</div>
              <div className="text-xs text-gray-500">{desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Warning */}
      <div className="flex gap-3 bg-amber-950/50 border border-amber-500/30 rounded-xl px-4 py-3">
        <span className="text-amber-400 text-base shrink-0">⚠</span>
        <p className="text-xs text-amber-300/80 leading-relaxed">
          You will be shown a seed phrase. Write it down on paper and store it safely.
          Anyone with your seed phrase has full access to your funds.
        </p>
      </div>

      <button
        onClick={generate}
        disabled={loading}
        className="w-full py-3.5 rounded-xl bg-polkadot-pink hover:bg-polkadot-pink/90 disabled:opacity-60 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2"
      >
        {loading ? (
          <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Generating…</>
        ) : (
          <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Generate Wallet</>
        )}
      </button>

      <p className="text-center text-xs text-gray-600">
        Already have a wallet?{' '}
        <a href="#" className="text-polkadot-pink hover:underline" onClick={e => { e.preventDefault(); window.dispatchEvent(new CustomEvent('vs:navigate', { detail: 'home' })); }}>
          Go to Score →
        </a>
      </p>
    </div>
  );
}

// ── Step 2 ── Seed phrase ──────────────────────────────────────────────────────
function Step2({ wallet, onNext }: { wallet: WalletData; onNext: () => void }) {
  const [revealed,  setRevealed]  = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const words = wallet.mnemonic.split(' ');

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Save Your Seed Phrase</h2>
        <p className="text-gray-400 text-sm leading-relaxed">
          Write these 12 words down in order. This is the only way to recover your wallet.
        </p>
      </div>

      {/* Word grid */}
      <div className="relative">
        <div className={`grid grid-cols-3 gap-2 transition-all duration-300 ${!revealed ? 'blur-md select-none pointer-events-none' : ''}`}>
          {words.map((word, i) => (
            <div key={i} className="flex items-center gap-2 bg-polkadot-dark border border-polkadot-border rounded-lg px-3 py-2">
              <span className="text-[10px] text-gray-600 w-4 shrink-0 text-right">{i + 1}</span>
              <span className="text-sm font-mono text-white font-medium">{word}</span>
            </div>
          ))}
        </div>
        {!revealed && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={() => setRevealed(true)}
              className="flex items-center gap-2 bg-polkadot-card border border-polkadot-border rounded-xl px-5 py-3 text-sm font-medium text-white hover:border-polkadot-pink/50 transition-all shadow-xl"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              Reveal Seed Phrase
            </button>
          </div>
        )}
      </div>

      {revealed && (
        <div className="flex justify-end">
          <CopyButton text={wallet.mnemonic} label="Copy all words" />
        </div>
      )}

      {/* Warning */}
      <div className="flex gap-3 bg-red-950/40 border border-red-500/30 rounded-xl px-4 py-3">
        <span className="text-red-400 text-base shrink-0 mt-0.5">✗</span>
        <p className="text-xs text-red-300/80 leading-relaxed">
          Never share your seed phrase with anyone. VeraScore will never ask for it. 
          Store it offline — not in screenshots, cloud storage, or messages.
        </p>
      </div>

      {/* Confirm checkbox */}
      <label className="flex items-start gap-3 cursor-pointer group">
        <div
          onClick={() => setConfirmed(c => !c)}
          className={`mt-0.5 w-4 h-4 rounded shrink-0 border-2 flex items-center justify-center transition-all ${
            confirmed ? 'bg-polkadot-pink border-polkadot-pink' : 'border-gray-600 group-hover:border-gray-400'
          }`}
        >
          {confirmed && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
        </div>
        <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors select-none">
          I have written down my seed phrase and stored it safely
        </span>
      </label>

      <button
        onClick={onNext}
        disabled={!confirmed || !revealed}
        className="w-full py-3.5 rounded-xl bg-polkadot-pink hover:bg-polkadot-pink/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all"
      >
        Continue to MetaMask Import →
      </button>
    </div>
  );
}

// ── Step 3 ── MetaMask import ──────────────────────────────────────────────────
function Step3({ wallet, onNext }: { wallet: WalletData; onNext: () => void }) {
  const [showKey, setShowKey] = useState(false);
  const [adding,  setAdding]  = useState(false);
  const [netAdded, setNetAdded] = useState(false);

  const addNetwork = async () => {
    if (!window.ethereum) return;
    setAdding(true);
    try {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId:         CHAIN_ID,
          chainName:       CHAIN_NAME,
          rpcUrls:         [RPC_URL],
          nativeCurrency:  { name: 'PAS', symbol: 'PAS', decimals: 18 },
          blockExplorerUrls: [EXPLORER],
        }],
      });
      setNetAdded(true);
    } catch { /* user rejected */ }
    setAdding(false);
  };

  const importToMetaMask = async () => {
    if (!window.ethereum) return;
    try {
      await (window.ethereum as any).request({
        method: 'wallet_importAccount',
        params: [wallet.privateKey],
      });
    } catch {
      // wallet_importAccount is not widely supported — show manual instructions
      setShowKey(true);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Import to MetaMask</h2>
        <p className="text-gray-400 text-sm leading-relaxed">
          Add the Polkadot Hub TestNet network, then import your private key to use VeraScore.
        </p>
      </div>

      {/* Step A — Add network */}
      <div className="bg-polkadot-dark border border-polkadot-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${netAdded ? 'bg-green-500' : 'bg-polkadot-pink'}`}>
              {netAdded ? '✓' : '1'}
            </span>
            <span className="text-sm font-medium text-white">Add Polkadot Hub TestNet</span>
          </div>
          {netAdded && <span className="text-xs text-green-400">Added ✓</span>}
        </div>
        {!netAdded && (
          <button
            onClick={addNetwork}
            disabled={adding}
            className="w-full py-2.5 rounded-lg bg-polkadot-pink/15 hover:bg-polkadot-pink/25 border border-polkadot-pink/30 text-polkadot-pink text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {adding ? <><svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Adding…</> : '🦊 Add to MetaMask'}
          </button>
        )}
      </div>

      {/* Step B — Private key */}
      <div className="bg-polkadot-dark border border-polkadot-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-polkadot-pink flex items-center justify-center text-xs font-bold shrink-0">2</span>
          <span className="text-sm font-medium text-white">Import Account via Private Key</span>
        </div>
        <p className="text-xs text-gray-500">
          Open MetaMask → Account selector → Add account → Import account → paste your private key.
        </p>

        <div className="relative">
          <div className={`font-mono text-xs break-all px-3 py-2.5 rounded-lg bg-black/40 border border-white/5 text-gray-300 transition-all ${!showKey ? 'blur-sm select-none' : ''}`}>
            {wallet.privateKey}
          </div>
          {!showKey && (
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                onClick={() => setShowKey(true)}
                className="flex items-center gap-1.5 bg-polkadot-card border border-polkadot-border rounded-lg px-3 py-1.5 text-xs text-white hover:border-polkadot-pink/40 transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                Reveal private key
              </button>
            </div>
          )}
        </div>
        {showKey && (
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-red-400">⚠ Never share this key</p>
            <CopyButton text={wallet.privateKey} label="Copy key" />
          </div>
        )}
      </div>

      {/* Your address */}
      <div className="bg-polkadot-dark border border-polkadot-border rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 uppercase tracking-wider">Your EVM Address</span>
          <CopyButton text={wallet.address} label="Copy address" />
        </div>
        <p className="font-mono text-sm text-white break-all">{wallet.address}</p>
      </div>

      <button
        onClick={onNext}
        className="w-full py-3.5 rounded-xl bg-polkadot-pink hover:bg-polkadot-pink/90 text-white font-semibold text-sm transition-all"
      >
        Continue to Fund Wallet →
      </button>
    </div>
  );
}

// ── Step 4 ── Fund & Score ─────────────────────────────────────────────────────
function Step4({ wallet, onNavigateHome }: { wallet: WalletData; onNavigateHome: () => void }) {
  return (
    <div className="space-y-5">
      <div>
        <div className="w-12 h-12 rounded-2xl bg-green-500/15 border border-green-500/30 flex items-center justify-center text-2xl mb-4">✓</div>
        <h2 className="text-2xl font-bold text-white mb-2">Wallet Ready!</h2>
        <p className="text-gray-400 text-sm leading-relaxed">
          Fund your wallet with PAS from the faucet, then come back to get your credit score.
        </p>
      </div>

      {/* Address */}
      <div className="bg-polkadot-dark border border-polkadot-border rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 uppercase tracking-wider">Your Address</span>
          <CopyButton text={wallet.address} label="Copy" />
        </div>
        <p className="font-mono text-xs text-white break-all">{wallet.address}</p>
      </div>

      {/* Faucet */}
      <a
        href={FAUCET_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between w-full bg-polkadot-dark hover:bg-white/5 border border-polkadot-border hover:border-polkadot-pink/40 rounded-xl p-4 transition-all group"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🚰</span>
          <div className="text-left">
            <div className="text-sm font-medium text-white">Get PAS from Faucet</div>
            <div className="text-xs text-gray-500">faucet.polkadot.io — free testnet tokens</div>
          </div>
        </div>
        <svg className="w-4 h-4 text-gray-600 group-hover:text-polkadot-pink transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
      </a>

      {/* Explorer */}
      <a
        href={`${EXPLORER}/address/${wallet.address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between w-full bg-polkadot-dark hover:bg-white/5 border border-polkadot-border hover:border-white/20 rounded-xl p-4 transition-all group"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔍</span>
          <div className="text-left">
            <div className="text-sm font-medium text-white">View on Routescan</div>
            <div className="text-xs text-gray-500">Track your balance and transactions</div>
          </div>
        </div>
        <svg className="w-4 h-4 text-gray-600 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
      </a>

      {/* Steps reminder */}
      <div className="bg-polkadot-dark border border-polkadot-border rounded-xl p-4 space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">What's next</p>
        {[
          'Paste your address in the faucet and request PAS',
          'Import the private key into MetaMask',
          'Connect MetaMask on the Score page',
          'Get your AI credit score minted on-chain',
        ].map((step, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className="w-4 h-4 rounded-full bg-polkadot-pink/20 border border-polkadot-pink/40 text-polkadot-pink text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">
              {i + 1}
            </span>
            <span className="text-xs text-gray-400">{step}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onNavigateHome}
        className="w-full py-3.5 rounded-xl bg-polkadot-pink hover:bg-polkadot-pink/90 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
        Go to Score Page
      </button>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────
export function CreateWallet({ onNavigateHome }: { onNavigateHome: () => void }) {
  const [step,   setStep]   = useState<Step>(1);
  const [wallet, setWallet] = useState<WalletData | null>(null);

  const handleGenerate = useCallback((w: WalletData) => {
    setWallet(w);
    setStep(2);
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-lg mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-6">
          <div className="text-xs text-gray-600 uppercase tracking-widest mb-1">VeraScore</div>
          <StepDots step={step} />
        </div>

        {/* Step content */}
        {step === 1 && (
          <Step1 onGenerate={handleGenerate} />
        )}
        {step === 2 && wallet && (
          <Step2 wallet={wallet} onNext={() => setStep(3)} />
        )}
        {step === 3 && wallet && (
          <Step3 wallet={wallet} onNext={() => setStep(4)} />
        )}
        {step === 4 && wallet && (
          <Step4 wallet={wallet} onNavigateHome={onNavigateHome} />
        )}

        {/* Back button */}
        {step > 1 && step < 4 && (
          <button
            onClick={() => setStep(s => (s - 1) as Step)}
            className="mt-4 w-full py-2.5 rounded-xl border border-white/5 text-gray-600 hover:text-gray-400 text-sm transition-all"
          >
            ← Back
          </button>
        )}

        {/* Security note */}
        <p className="text-center text-[10px] text-gray-700 mt-6">
          Keys generated locally · Never transmitted · Open source
        </p>
      </div>
    </div>
  );
}