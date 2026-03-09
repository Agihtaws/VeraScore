import { useState, useEffect, useRef } from 'react';
import { useAccount, useChainId, useSwitchChain, useConnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { ScoreCard }      from '../components/ScoreCard.js';
import { NFTViewer }      from '../components/NFTViewer.js';
import { HistoryChart }   from '../components/HistoryChart.js';
import { useScore }        from '../hooks/useScore.js';
import type { ScoreStatus } from '../hooks/useScore.js';
import { useTotalScored }  from '../hooks/useTotalScored.js';
import { pasTestnet, SCORE_NFT_PROXY } from '../utils/wagmi.js';
import type { HistoryRecord } from '../types/index.js';

const EXPLORER = 'https://polkadot.testnet.routescan.io';

import type { Page } from '../components/Sidebar.js';

interface Props {
  onNavigate: (page: Page) => void;
}

const STAGES: { key: ScoreStatus; label: string }[] = [
  { key: 'reading',          label: 'Chain read'  },
  { key: 'scoring',          label: 'AI Scoring'  },
  { key: 'signing',          label: 'Sign tx'     },
  { key: 'waiting',          label: 'MetaMask'    },
  { key: 'relay_auth',       label: 'Authorize'   },
  { key: 'relay_submitting', label: 'Relaying'    },
  { key: 'confirming',       label: 'Confirming'  },
];

const STAGE_KEYS = STAGES.map(s => s.key);

const FEATURES = [
  {
    icon: '⛓',
    title: 'Fully On-Chain',
    desc:  'Score NFT metadata is generated entirely on-chain as an SVG. No IPFS, no external hosting — nothing that can go down.',
  },
  {
    icon: '🤖',
    title: 'AI Scoring',
    desc:  'Mistral AI analyses 6 on-chain factors — transactions, balance, stablecoin holdings, account age — and scores 0–1000.',
  },
  {
    icon: '🔒',
    title: 'Soulbound NFT',
    desc:  'Non-transferable ERC-721. Valid 2 hours, refreshable after 5 minutes. Your score is your own — it cannot be sold or transferred.',
  },
  {
    icon: '🏦',
    title: 'DeFi Ready',
    desc:  'Any protocol calls GET /verify/:address to read your score in one request. No oracle dependency. No manual review.',
  },
] as const;

const HOW_IT_WORKS = [
  ['01', 'Chain data',    'Nonce, PAS balance, USDT/USDC, reserved/frozen — all read directly from PAS TestNet via Polkadot API'],
  ['02', 'AI scoring',    'Mistral AI scores 6 on-chain factors and produces a 0–1000 score with full per-category reasoning'],
  ['03', 'EIP-712 sign',  'Backend signs the payload cryptographically — you verify the terms and pay gas in MetaMask'],
  ['04', 'Soulbound NFT', 'Score minted as non-transferable NFT with on-chain SVG · Valid 2 hours · Refreshable after 5 minutes'],
] as const;

function fmt(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('en-GB', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
}


// Format seconds into readable wait time
function formatWait(sec: number): string {
  if (sec <= 0)  return 'now';
  if (sec < 60)  return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function Home({ onNavigate }: Props) {
  const { address, isConnected } = useAccount();
  const [inputAddr, setInputAddr] = useState<string>('');

  // Sync inputAddr with connected wallet (only when not manually edited)
  const wasManuallyEdited = useRef(false);
  useEffect(() => {
    if (!wasManuallyEdited.current) {
      setInputAddr(address ?? '');
    }
  }, [address]);
  const chainId                  = useChainId();
  const { switchChain }          = useSwitchChain();
  const { connect }              = useConnect();
  const isWrongNetwork            = isConnected && chainId !== pasTestnet.id;
  const isMismatch                = isConnected && !!address && inputAddr.toLowerCase() !== address.toLowerCase() && inputAddr.startsWith('0x') && inputAddr.length === 42;

  const { status, payload, error, cooldownTs, gasEstimate, rateLimitSec, hasCachedPayload, requestScore, retryMint, reset } = useScore();
  const totalScored = useTotalScored();

  // ── Full score history (fetched after mint) ────────────────────────────────
  const [fullHistory, setFullHistory] = useState<HistoryRecord[]>([]);
  useEffect(() => {
    if (status !== 'done' || !payload?.wallet) return;
    fetch(`/score/${payload.wallet}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.history) setFullHistory(data.history); })
      .catch(() => {});
  }, [status, payload?.wallet]);

  // ── Reset everything when wallet changes or disconnects ───────────────────
  const prevAddress = useRef<string | undefined>(undefined);
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
    if (status !== 'cooldown') return;
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1_000)), 1_000);
    return () => clearInterval(id);
  }, [status]);

  // ── Elapsed timer shown while AI is scoring (the slow step) ───────────────
  const [scoringStart, setScoringStart] = useState<number | null>(null);
  const [elapsed, setElapsed]           = useState(0);
  useEffect(() => {
    if (status === 'scoring') {
      setScoringStart(Date.now());
      setElapsed(0);
    } else {
      setScoringStart(null);
    }
  }, [status]);
  useEffect(() => {
    if (!scoringStart) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - scoringStart) / 1_000)), 1_000);
    return () => clearInterval(id);
  }, [scoringStart]);

  function liveRemaining(ts: number) {
    const secs = ts - now;
    if (secs <= 0) return 'now';
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  const isLoading     = STAGE_KEYS.includes(status);
  const currentStageI = STAGE_KEYS.indexOf(status);

  // Use full fetched history; fall back to current mint only while fetch is in flight
  const currentMintEntry: HistoryRecord | null = payload?.txHash ? {
    id:        Date.now(),
    address:   payload.wallet,
    score:     payload.score,
    breakdown: JSON.stringify(payload.breakdown),
    txHash:    payload.txHash,
    timestamp: payload.rawChainData.queriedAt,
  } : null;
  const historyForChart: HistoryRecord[] =
    fullHistory.length > 0 ? fullHistory :
    currentMintEntry ? [currentMintEntry] : [];

  // ── LANDING PAGE (not connected) ──────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="flex flex-col">

        {/* Hero */}
        <section className="relative overflow-hidden border-b border-polkadot-border">
          {/* Background grid */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: 'linear-gradient(#E6007A 1px, transparent 1px), linear-gradient(90deg, #E6007A 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
          {/* Glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-polkadot-pink opacity-[0.06] rounded-full blur-3xl pointer-events-none" />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-20 sm:py-28 text-center space-y-8">

            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-polkadot-card border border-polkadot-border rounded-full px-4 py-1.5 text-xs text-gray-400">
              <span className="w-2 h-2 rounded-full bg-polkadot-pink inline-block animate-pulse" />
              Live on PAS TestNet · Chain ID 420420417
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
              On-Chain Credit Scoring<br />
              <span className="text-polkadot-pink">for Polkadot</span>
            </h1>

            {/* Two-sentence description */}
            <p className="text-gray-400 text-lg sm:text-xl leading-relaxed max-w-2xl mx-auto">
              VeraScore mints your Polkadot wallet history as a permanent, soulbound NFT credential
              scored 0–1000 by Mistral AI.{' '}
              Any DeFi protocol can verify your creditworthiness in a single API call —
              no oracles, no manual review, nothing that can go down.
            </p>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={() => connect({ connector: injected() })}
                className="w-full sm:w-auto bg-polkadot-pink hover:bg-pink-600 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors text-base"
              >
                Get My Score →
              </button>
              <button
                onClick={() => onNavigate('lookup')}
                className="w-full sm:w-auto border border-polkadot-border hover:border-gray-500 text-gray-300 hover:text-white font-medium px-8 py-3.5 rounded-xl transition-colors text-base"
              >
                Look Up a Wallet
              </button>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap items-center justify-center gap-8 pt-4 text-sm text-gray-500">
              {[
                ['0–1000', 'Score range'],
                ['2 hours', 'NFT validity'],
                ['5 minutes', 'Refresh cooldown'],
                ['1 API call', 'Protocol integration'],
              ].map(([val, label]) => (
                <div key={label} className="text-center">
                  <div className="text-white font-semibold text-base">{val}</div>
                  <div className="text-gray-600 text-xs">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-20 w-full">
          <div className="text-center space-y-2 mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold">Why VeraScore</h2>
            <p className="text-gray-500 text-sm">Built on Polkadot Hub · Powered by Mistral AI</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map(({ icon, title, desc }) => (
              <div
                key={title}
                className="bg-polkadot-card border border-polkadot-border rounded-2xl p-6 space-y-3 hover:border-gray-600 transition-colors"
              >
                <div className="text-3xl">{icon}</div>
                <div className="font-semibold text-white">{title}</div>
                <div className="text-gray-500 text-sm leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-polkadot-border bg-polkadot-card/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-20">
            <div className="text-center space-y-2 mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold">How it works</h2>
              <p className="text-gray-500 text-sm">Four steps from wallet to verified on-chain credential</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {HOW_IT_WORKS.map(([num, title, desc]) => (
                <div key={num} className="relative space-y-3">
                  <div className="text-polkadot-pink font-mono font-bold text-3xl">{num}</div>
                  <div className="font-semibold text-white">{title}</div>
                  <div className="text-gray-500 text-sm leading-relaxed">{desc}</div>
                </div>
              ))}
            </div>

            {/* Bottom CTA */}
            <div className="text-center mt-14">
              <button
                onClick={() => connect({ connector: injected() })}
                className="bg-polkadot-pink hover:bg-pink-600 text-white font-semibold px-10 py-3.5 rounded-xl transition-colors text-base"
              >
                Connect Wallet & Get My Score
              </button>
              <div className="mt-3 text-gray-600 text-xs">
                Supports MetaMask, WalletConnect, and any injected wallet
              </div>
            </div>
          </div>
        </section>

        {/* Contract info */}
        <section className="border-t border-polkadot-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span>V3 UUPS Proxy · On-chain SVG metadata · No IPFS</span>
              </div>
              <a
                href={`${EXPLORER}/address/${SCORE_NFT_PROXY}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-gray-500 hover:text-polkadot-pink transition-colors"
              >
                {SCORE_NFT_PROXY} ↗
              </a>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // ── CONNECTED — score flow ────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-10">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Wrong network */}
        {isWrongNetwork && (
          <div className="bg-yellow-950 border border-yellow-800 rounded-xl px-4 py-3 flex items-center justify-between text-sm">
            <span className="text-yellow-300">Switch to Polkadot Hub TestNet to continue</span>
            <button
              onClick={() => switchChain({ chainId: pasTestnet.id })}
              className="text-xs bg-yellow-500 hover:bg-yellow-400 text-black px-3 py-1.5 rounded-lg font-medium transition-colors ml-3 shrink-0"
            >
              Switch
            </button>
          </div>
        )}

        {/* Score flow */}
        {!isWrongNetwork && status !== 'done' && status !== 'cooldown' && (
          <div className="space-y-4">

            {/* Page title */}
            <div className="text-center space-y-1 pb-2">
              <h1 className="text-2xl font-bold">
                Your On-Chain <span className="text-polkadot-pink">Credit Score</span>
              </h1>
              <p className="text-gray-500 text-sm">
                AI analyses your wallet history and mints a permanent soulbound NFT credential.
              </p>
            </div>

            {/* Address input — editable, prefilled from MetaMask */}
            <div className="relative">
              <input
                type="text"
                value={inputAddr}
                onChange={e => { wasManuallyEdited.current = true; setInputAddr(e.target.value); }}
                placeholder="0x… paste any wallet address"
                spellCheck={false}
                className="w-full bg-polkadot-card border border-polkadot-border focus:border-polkadot-pink/60 rounded-xl px-4 py-3 text-sm font-mono text-gray-300 placeholder-gray-600 outline-none transition-colors break-all"
              />
              {address && inputAddr !== address && (
                <button
                  onClick={() => { wasManuallyEdited.current = false; setInputAddr(address); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-polkadot-pink hover:text-white bg-polkadot-pink/10 hover:bg-polkadot-pink/20 px-2 py-1 rounded-md transition-all"
                >
                  ↺ reset
                </button>
              )}
            </div>

            {/* Mismatch warning */}
            {isMismatch && (
              <div className="flex items-start gap-3 bg-amber-950/60 border border-amber-500/40 rounded-xl px-4 py-3">
                <span className="text-amber-400 text-base shrink-0 mt-0.5">⚠</span>
                <div className="space-y-1.5">
                  <p className="text-amber-300 text-sm font-medium">Address mismatch — minting will fail</p>
                  <p className="text-amber-300/70 text-xs leading-relaxed">
                    MetaMask is connected as <span className="font-mono">{address?.slice(0,6)}…{address?.slice(-4)}</span> but you're scoring <span className="font-mono">{inputAddr.slice(0,6)}…{inputAddr.slice(-4)}</span>.
                    The contract requires the signer to be the wallet being scored.
                  </p>
                  <div className="flex gap-2 pt-0.5">
                    <button
                      onClick={() => { wasManuallyEdited.current = false; setInputAddr(address!); }}
                      className="text-xs bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 px-3 py-1.5 rounded-lg transition-all"
                    >
                      ↺ Score my connected wallet
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Generate button */}
            <button
              onClick={() => requestScore(inputAddr)}
              disabled={isLoading || isMismatch || !inputAddr.startsWith('0x') || inputAddr.length !== 42}
              className="w-full bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-colors text-base"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  {status === 'waiting'          ? 'Confirm in MetaMask...'       :
                   status === 'relay_auth'        ? 'Sign authorization (free)...' :
                   status === 'relay_submitting'  ? 'Relaying via backend...'      :
                   status === 'confirming'        ? 'Waiting for block...'         :
                   'Processing...'}
                </span>
              ) : 'Generate Score'}
            </button>

            {/* 5-stage progress */}
            {isLoading && (
              <div className="pt-1">
                <div className="flex items-center justify-between">
                  {STAGES.map((stage, i) => {
                    const done   = currentStageI > i;
                    const active = currentStageI === i;
                    return (
                      <div key={stage.key} className="flex items-center flex-1">
                        <div className="flex flex-col items-center gap-1 w-full">
                          <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${
                            done   ? 'border-green-500 bg-green-950'    :
                            active ? 'border-polkadot-pink bg-pink-950' :
                                     'border-gray-700 bg-transparent'
                          }`}>
                            {done ? (
                              <svg className="h-3.5 w-3.5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                              </svg>
                            ) : active ? (
                              <svg className="animate-spin h-3.5 w-3.5 text-polkadot-pink" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                              </svg>
                            ) : (
                              <div className="w-2 h-2 rounded-full bg-gray-600" />
                            )}
                          </div>
                          <span className={`text-xs hidden sm:block ${
                            done ? 'text-green-400' : active ? 'text-polkadot-pink' : 'text-gray-600'
                          }`}>
                            {stage.label}
                          </span>
                        </div>
                        {i < STAGES.length - 1 && (
                          <div className={`h-px flex-1 mb-4 mx-1 transition-colors ${
                            currentStageI > i ? 'bg-green-800' : 'bg-polkadot-border'
                          }`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {status === 'scoring' && (
              <div className="bg-polkadot-card border border-polkadot-pink/30 rounded-xl px-4 py-3 text-sm text-center space-y-1.5">
                <div className="text-polkadot-pink font-medium animate-pulse">
                  🤖 Mistral AI analysing your on-chain history…
                </div>
                <div className="text-xs text-gray-500 font-mono">
                  {elapsed < 5
                    ? 'Fetching chain data via PAPI…'
                    : elapsed < 20
                    ? `Scoring in progress · ${elapsed}s`
                    : elapsed < 45
                    ? `Still working · ${elapsed}s — AI is thorough`
                    : `Almost there · ${elapsed}s`}
                </div>
                <div className="w-full bg-polkadot-border rounded-full h-1 overflow-hidden">
                  <div
                    className="h-1 rounded-full bg-polkadot-pink transition-all duration-1000"
                    style={{ width: `${Math.min(95, (elapsed / 60) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {status === 'waiting' && (
              <div className="bg-yellow-950 border border-yellow-800 rounded-xl px-4 py-3 text-sm text-yellow-300 text-center space-y-1">
                <div className="animate-pulse font-medium">
                  ⚡ Check MetaMask — confirm to mint your soulbound score NFT
                </div>
                {gasEstimate ? (
                  <div className="text-xs text-yellow-400/80 font-mono">
                    Estimated fee: <span className="font-bold text-yellow-300">{gasEstimate.pas} PAS</span>
                    <span className="text-yellow-600 ml-1">(~${gasEstimate.usd})</span>
                    <span className="ml-2 text-yellow-600">· Exact on-chain estimate</span>
                  </div>
                ) : (
                  <div className="text-xs text-yellow-600">Calculating exact fee...</div>
                )}
              </div>
            )}

            {status === 'relay_auth' && (
              <div className="bg-blue-950 border border-blue-700 rounded-xl px-4 py-3 text-sm text-blue-300 text-center animate-pulse">
                🔐 Check MetaMask — sign the free authorization message (no gas required)
              </div>
            )}

            {status === 'relay_submitting' && (
              <div className="bg-purple-950 border border-purple-700 rounded-xl px-4 py-3 text-sm text-purple-300 text-center animate-pulse">
                🚀 Backend is minting your NFT on-chain — paying gas with USDT fee payment
              </div>
            )}

            {/* Live stats — shown while idle */}
            {status === 'idle' && totalScored !== null && (
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  ['Wallets Scored',   totalScored.toString(), '🏅'],
                  ['On-Chain NFTs',    totalScored.toString(), '⛓'],
                  ['Network',         'PAS TestNet',           '🔴'],
                ].map(([label, value, icon]) => (
                  <div key={label as string} className="bg-polkadot-card border border-polkadot-border rounded-xl py-3 px-2 space-y-1">
                    <div className="text-lg">{icon}</div>
                    <div className="font-mono font-bold text-white text-sm">{value}</div>
                    <div className="text-gray-600 text-[10px] uppercase tracking-wider">{label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* How it works — shown while idle */}
            {status === 'idle' && (
              <div className="border border-polkadot-border rounded-xl p-5 space-y-4 mt-2">
                <div className="text-xs text-gray-500 uppercase tracking-widest">How it works</div>
                {HOW_IT_WORKS.map(([num, title, desc]) => (
                  <div key={num} className="flex gap-3 text-sm">
                    <span className="text-polkadot-pink font-mono font-bold w-6 shrink-0">{num}</span>
                    <div>
                      <span className="text-white font-medium">{title} — </span>
                      <span className="text-gray-400">{desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {status === 'error' && error && (
          error.startsWith('rate_limited:') ? (
            // ── Rate limit card — polished, not scary ──────────────────────
            <div className="bg-polkadot-card border border-polkadot-border rounded-2xl p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-orange-950 border border-orange-800 flex items-center justify-center text-2xl mx-auto">
                ⏳
              </div>
              <div className="space-y-1">
                <div className="text-white font-semibold text-lg">Scoring in Progress</div>
                <div className="text-gray-400 text-sm max-w-xs mx-auto">
                  A score was recently requested for this wallet. Please wait before requesting again.
                </div>
              </div>
              {rateLimitSec !== null && rateLimitSec > 0 && (
                <div className="inline-flex items-center gap-2 bg-orange-950 border border-orange-800 rounded-xl px-4 py-2">
                  <span className="text-orange-400 text-sm">Try again in</span>
                  <span className="font-mono font-bold text-orange-300 text-sm">
                    {formatWait(rateLimitSec)}
                  </span>
                </div>
              )}
              <button
                onClick={reset}
                className="block mx-auto text-xs text-gray-500 hover:text-gray-400 underline underline-offset-2 transition-colors"
              >
                Dismiss
              </button>
            </div>
          ) : error === 'retry_available' ? (
            // ── Score was generated but tx never confirmed — offer retry ───
            <div className="bg-polkadot-card border border-yellow-700 rounded-2xl p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-yellow-950 border border-yellow-700 flex items-center justify-center text-2xl mx-auto">
                ⚡
              </div>
              <div className="space-y-1">
                <div className="text-white font-semibold text-lg">Score Ready — Mint Pending</div>
                <div className="text-gray-400 text-sm max-w-xs mx-auto">
                  Your score was generated successfully but the mint transaction didn't complete.
                  Your signed payload is still valid — reopen MetaMask to finish.
                </div>
              </div>
              <button
                onClick={() => retryMint()}
                className="w-full bg-polkadot-pink hover:bg-pink-600 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
              >
                ↻ Reopen MetaMask — finish minting
              </button>
              <button
                onClick={reset}
                className="block mx-auto text-xs text-gray-500 hover:text-gray-400 underline underline-offset-2 transition-colors"
              >
                Start over instead
              </button>
            </div>
          ) : (
            // ── Generic error card ──────────────────────────────────────────
            <div className="bg-red-950 border border-red-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-red-400 text-lg mt-0.5">⚠</span>
                <div className="space-y-1 flex-1">
                  <div className="text-red-300 text-sm font-medium">Something went wrong</div>
                  <div className="text-red-400/80 text-xs leading-relaxed">{error}</div>
                </div>
              </div>
              {hasCachedPayload ? (
                <div className="space-y-2">
                  <button
                    onClick={() => retryMint()}
                    className="w-full text-xs bg-polkadot-pink hover:bg-pink-600 text-white py-2.5 px-4 rounded-lg transition-colors font-medium"
                  >
                    ↻ Retry mint — reopen MetaMask
                  </button>
                  <button
                    onClick={reset}
                    className="w-full text-xs bg-red-900 hover:bg-red-800 text-red-300 py-2 px-4 rounded-lg transition-colors"
                  >
                    Start over (re-score)
                  </button>
                </div>
              ) : (
                <button
                  onClick={reset}
                  className="w-full text-xs bg-red-900 hover:bg-red-800 text-red-300 py-2 px-4 rounded-lg transition-colors"
                >
                  Try again
                </button>
              )}
            </div>
          )
        )}

        {/* Cooldown */}
        {status === 'cooldown' && cooldownTs !== null && (
          <div className="bg-polkadot-card border border-polkadot-border rounded-2xl p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-yellow-950 border border-yellow-800 flex items-center justify-center text-3xl mx-auto">
              🔒
            </div>
            <div className="space-y-1">
              <div className="text-white font-semibold text-xl">Score Refresh Locked</div>
              <div className="text-gray-400 text-sm max-w-sm mx-auto">
                Your score NFT was already minted on-chain. The 7-day cooldown prevents score manipulation.
              </div>
            </div>
            <div className="bg-yellow-950 border border-yellow-800 rounded-xl px-5 py-4 space-y-1">
              <div className="text-yellow-300 text-xs uppercase tracking-widest">Refresh available</div>
              <div className="text-yellow-200 font-semibold text-base">{fmt(cooldownTs)}</div>
              <div className="text-yellow-400 font-mono text-2xl font-bold tracking-tight">
                {liveRemaining(cooldownTs)}
              </div>
              <div className="text-yellow-600 text-xs">remaining</div>
            </div>
            <div className="text-gray-400 text-sm">
              Your current score is visible in the{' '}
              <button
                onClick={() => onNavigate('lookup')}
                className="text-polkadot-pink hover:text-pink-400 underline"
              >
                Lookup
              </button>{' '}
              tab.
            </div>
            <button
              onClick={reset}
              className="w-full border border-polkadot-border hover:border-gray-500 text-gray-400 hover:text-white text-sm py-2.5 rounded-xl transition-colors"
            >
              Back
            </button>
          </div>
        )}

        {/* Done — score result */}
        {payload && status === 'done' && (
          <div className="space-y-4">
            <div className={`rounded-xl px-4 py-3 text-sm text-center font-medium ${
              payload.alreadyHadScore
                ? 'bg-blue-950 border border-blue-800 text-blue-300'
                : 'bg-green-950 border border-green-800 text-green-300'
            }`}>
              {payload.alreadyHadScore
                ? '✓ Score updated — soulbound NFT refreshed on-chain'
                : '✓ Soulbound Score NFT minted to your wallet'}
            </div>

            <ScoreCard payload={payload} />

            {/* On-chain SVG NFT — fetched directly from contract tokenURI */}
            {payload.txHash && (
              <NFTViewer
                wallet={payload.wallet}
                proxyAddress={SCORE_NFT_PROXY as `0x${string}`}
              />
            )}

            {historyForChart.length > 0 && <HistoryChart history={historyForChart} />}

            {payload.relayed && (
              <div className="bg-purple-950 border border-purple-700 rounded-xl px-4 py-2.5 text-xs text-purple-300 text-center">
                ✅ Minted via gasless relay — paid with USDT, zero PAS required
              </div>
            )}

            {payload.txHash && (
              <div className="space-y-1.5 text-xs text-center">
                <a
                  href={`${EXPLORER}/tx/${payload.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-polkadot-pink hover:text-pink-400 font-mono transition-colors"
                >
                  View mint transaction on Routescan ↗
                </a>
                <a
                  href={`${EXPLORER}/address/${SCORE_NFT_PROXY}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-gray-500 hover:text-gray-400 transition-colors"
                >
                  View contract ↗
                </a>
              </div>
            )}

            <button
              onClick={() => { reset(); setFullHistory([]); }}
              className="w-full border border-polkadot-border hover:border-gray-500 text-gray-400 hover:text-white text-sm py-2.5 rounded-xl transition-colors"
            >
              Score again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}