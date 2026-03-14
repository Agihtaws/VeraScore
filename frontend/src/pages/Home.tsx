import { useState, useEffect, useRef } from 'react';
import { useAccount, useChainId, useSwitchChain, useConnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { ScoreCard }      from '../components/ScoreCard';
import { NFTViewer }      from '../components/NFTViewer';
import { HistoryChart }   from '../components/HistoryChart';
import { useScore }        from '../hooks/useScore';
import type { ScoreStatus } from '../hooks/useScore';
import { useTotalScored }  from '../hooks/useTotalScored';
import { pasTestnet, SCORE_NFT_PROXY } from '../utils/wagmi';
import type { HistoryRecord } from '../types/index';
import type { Page } from '../components/Sidebar';

const EXPLORER = 'https://polkadot.testnet.routescan.io';
interface Props { onNavigate: (page: Page) => void; }

const STAGES: { key: ScoreStatus; label: string }[] = [
  { key: 'reading',          label: 'Chain'      },
  { key: 'scoring',          label: 'AI'         },
  { key: 'signing',          label: 'Sign'       },
  { key: 'waiting',          label: 'MetaMask'   },
  { key: 'relay_auth',       label: 'Auth'       },
  { key: 'relay_submitting', label: 'Relay'      },
  { key: 'confirming',       label: 'Confirm'    },
];
const STAGE_KEYS = STAGES.map(s => s.key);

const FEATURES = [
  { icon: '⛓', title: 'Fully On-Chain',  desc: 'Score NFT metadata as on-chain SVG. No IPFS, no external hosting.' },
  { icon: '🤖', title: 'AI Scoring',      desc: 'Mistral AI analyses 6 on-chain factors and scores 0–1100.' },
  { icon: '🔒', title: 'Soulbound NFT',   desc: 'Non-transferable ERC-721. Valid 2h, refreshable after 5 min.' },
  { icon: '🏦', title: 'DeFi Ready',      desc: 'One API call: GET /verify/:address. No oracle, no review.' },
] as const;

const HOW_IT_WORKS = [
  ['01', 'Chain Data',    'Nonce, PAS balance, USDT/USDC, reserved/frozen via Polkadot API'],
  ['02', 'AI Scoring',    'Mistral AI scores 6 factors → 0–1100 with per-category reasoning'],
  ['03', 'EIP-712 Sign',  'Backend signs payload · you verify terms and pay gas in MetaMask'],
  ['04', 'Soulbound NFT', 'On-chain SVG NFT · Valid 2h · Refreshable after 5 min'],
] as const;

function fmt(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
}
function formatWait(sec: number): string {
  if (sec <= 0) return 'now';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function Home({ onNavigate }: Props) {
  const { address, isConnected } = useAccount();
  const [inputAddr, setInputAddr] = useState('');
  const wasManuallyEdited = useRef(false);
  useEffect(() => {
    if (!wasManuallyEdited.current) setInputAddr(address ?? '');
  }, [address]);

  const chainId         = useChainId();
  const { switchChain } = useSwitchChain();
  const { connect }     = useConnect();
  const isWrongNetwork  = isConnected && chainId !== pasTestnet.id;
  const isMismatch      = isConnected && !!address
    && inputAddr.toLowerCase() !== address.toLowerCase()
    && inputAddr.startsWith('0x') && inputAddr.length === 42;

  const { status, payload, error, cooldownTs, gasEstimate, rateLimitSec, hasCachedPayload, requestScore, retryMint, reset } = useScore();
  const totalScored = useTotalScored();

  const isRateLimitError = !!error && (
    error.startsWith('rate_limited:') ||
    error.toLowerCase().includes('rate limit') ||
    error.toLowerCase().includes('rate limited') ||
    error.toLowerCase().includes('try again in')
  );

  const [fullHistory, setFullHistory] = useState<HistoryRecord[]>([]);
  useEffect(() => {
    if (status !== 'done' || !payload?.wallet) return;
    fetch(`/score/${payload.wallet}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.history) setFullHistory(data.history); })
      .catch(() => {});
  }, [status, payload?.wallet]);

  const prevAddress = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevAddress.current !== undefined && prevAddress.current !== address) {
      reset(); setFullHistory([]);
    }
    prevAddress.current = address;
  }, [address]);

  const [now, setNow] = useState(() => Math.floor(Date.now() / 1_000));
  useEffect(() => {
    if (status !== 'cooldown') return;
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1_000)), 1_000);
    return () => clearInterval(id);
  }, [status]);

  function liveRemaining(ts: number) {
    const secs = ts - now;
    if (secs <= 0) return 'now';
    const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600);
    const m = Math.floor((secs % 3600) / 60), s = secs % 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  const isLoading     = STAGE_KEYS.includes(status);
  const currentStageI = STAGE_KEYS.indexOf(status);
  const currentMintEntry: HistoryRecord | null = payload?.txHash ? {
    id: Date.now(), address: payload.wallet, score: payload.score,
    breakdown: JSON.stringify(payload.breakdown), txHash: payload.txHash,
    timestamp: payload.rawChainData.queriedAt,
  } : null;
  const historyForChart: HistoryRecord[] =
    fullHistory.length > 0 ? fullHistory : currentMintEntry ? [currentMintEntry] : [];

  // ─────────────────────────────────────────────────────────────────────────
  // LANDING (not connected)
  // ─────────────────────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="flex flex-col min-h-0">

        {/* Hero ── compact, no massive padding */}
        <section className="relative overflow-hidden border-b border-polkadot-border">
          <div className="absolute inset-0 opacity-[0.025]" style={{
            backgroundImage: 'linear-gradient(#E6007A 1px,transparent 1px),linear-gradient(90deg,#E6007A 1px,transparent 1px)',
            backgroundSize: '32px 32px',
          }}/>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-polkadot-pink opacity-[0.06] rounded-full blur-3xl pointer-events-none"/>

          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 text-center space-y-5">

            <div className="inline-flex items-center gap-1.5 bg-polkadot-pink/10 border border-polkadot-pink/20 rounded-full px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-polkadot-pink">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
              Paseo Asset Hub · Live v2.0
            </div>

            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-tight">
              The Protocol for{' '}
              <span className="text-polkadot-pink">On-Chain Credit</span>
            </h1>

            <p className="text-gray-500 text-xs sm:text-sm max-w-lg mx-auto leading-relaxed">
              VeraScore turns your Substrate wallet history into a verifiable credit profile.
              Scored <span className="text-gray-300 font-semibold">0–1100</span> by Mistral AI and secured as a soulbound NFT.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1">
              <button onClick={() => connect({ connector: injected() })}
                className="w-full sm:w-auto bg-polkadot-pink hover:bg-pink-600 text-white font-bold text-xs uppercase tracking-widest px-7 py-3 rounded-xl transition-all shadow-[0_0_16px_rgba(230,0,122,0.3)] hover:shadow-[0_0_24px_rgba(230,0,122,0.5)]">
                Establish Identity →
              </button>
              <button onClick={() => onNavigate('lookup')}
                className="w-full sm:w-auto border border-polkadot-border hover:border-gray-500 text-gray-500 hover:text-white font-bold text-xs uppercase tracking-widest px-7 py-3 rounded-xl transition-all">
                Public Lookup
              </button>
            </div>

            {/* 4-stat strip */}
            <div className="grid grid-cols-4 gap-2 max-w-sm mx-auto pt-1">
              {([['0–1100','Score'],['2 hrs','Valid'],['5 min','CD'],['1 API','DeFi']] as [string,string][]).map(([v,l])=>(
                <div key={l} className="bg-white/5 border border-white/5 rounded-xl py-2.5 text-center">
                  <div className="text-xs font-black text-white font-mono">{v}</div>
                  <div className="text-[8px] font-bold uppercase tracking-wide text-gray-600 mt-0.5">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features ── 4-col compact */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-polkadot-border"/>
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600">Why VeraScore</span>
            <div className="h-px flex-1 bg-polkadot-border"/>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {FEATURES.map(({ icon, title, desc }) => (
              <div key={title}
                className="bg-polkadot-card border border-polkadot-border rounded-2xl p-4 space-y-2 hover:border-polkadot-pink/20 hover:bg-polkadot-pink/[0.03] transition-all group cursor-default">
                <div className="text-xl">{icon}</div>
                <div className="text-xs font-bold text-white group-hover:text-polkadot-pink transition-colors">{title}</div>
                <div className="text-[10px] text-gray-600 leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works ── 4-col compact */}
        <section className="border-t border-polkadot-border bg-black/10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-polkadot-border"/>
              <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600">How It Works</span>
              <div className="h-px flex-1 bg-polkadot-border"/>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {HOW_IT_WORKS.map(([num, title, desc]) => (
                <div key={num} className="bg-polkadot-card border border-polkadot-border rounded-2xl p-4 space-y-2">
                  <div className="text-polkadot-pink font-black font-mono text-xl">{num}</div>
                  <div className="text-xs font-bold text-white">{title}</div>
                  <div className="text-[10px] text-gray-600 leading-relaxed">{desc}</div>
                </div>
              ))}
            </div>
            <div className="text-center pt-2 space-y-2">
              <button onClick={() => connect({ connector: injected() })}
                className="bg-polkadot-pink hover:bg-pink-600 text-white font-bold text-xs uppercase tracking-widest px-8 py-3 rounded-xl transition-all shadow-[0_0_16px_rgba(230,0,122,0.25)]">
                Connect Wallet &amp; Get My Score
              </button>
              <div className="text-[9px] text-gray-700">MetaMask &amp; any injected wallet</div>
            </div>
          </div>
        </section>

        {/* Contract bar */}
        <section className="border-t border-polkadot-border">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-[9px] text-gray-700">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"/>
                V3 UUPS Proxy · On-chain SVG · No IPFS
              </div>
              <a href={`${EXPLORER}/address/${SCORE_NFT_PROXY}`} target="_blank" rel="noopener noreferrer"
                className="font-mono hover:text-polkadot-pink transition-colors">{SCORE_NFT_PROXY} ↗</a>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONNECTED — score flow
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4">

      {/* Page header — small, not a hero */}
      <div>
        <h1 className="text-xl font-black tracking-tight text-white">
          On-Chain <span className="text-polkadot-pink">Credit Score</span>
        </h1>
        <p className="text-[10px] text-gray-600 mt-0.5 font-medium">
          AI analyses your wallet · Soulbound NFT · Paseo Asset Hub
        </p>
      </div>

      {/* Wrong network */}
      {isWrongNetwork && (
        <div className="flex items-center justify-between bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-4 py-3">
          <span className="text-xs font-semibold text-yellow-400">⚠ Switch to Polkadot Hub TestNet</span>
          <button onClick={() => switchChain({ chainId: pasTestnet.id })}
            className="ml-3 shrink-0 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 font-bold text-[9px] uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all">
            Switch
          </button>
        </div>
      )}

      {/* ── Score flow ──────────────────────────────────────────────────── */}
      {!isWrongNetwork && status !== 'done' && status !== 'cooldown' && (
        <div className="space-y-3">

          {/* Wallet input card */}
          <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-polkadot-border bg-black/20 flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Wallet to Score</span>
              {totalScored !== null && (
                <span className="text-[9px] text-gray-600 font-mono">{totalScored} scored</span>
              )}
            </div>
            <div className="px-4 py-4 space-y-3">
              <div className="relative">
                <input
                  type="text"
                  value={inputAddr}
                  onChange={e => { wasManuallyEdited.current = true; setInputAddr(e.target.value); }}
                  placeholder="0x… paste any wallet address"
                  spellCheck={false}
                  className="w-full bg-polkadot-dark border border-polkadot-border focus:border-polkadot-pink/40 rounded-xl px-4 py-2.5 text-xs font-mono text-gray-300 placeholder-gray-700 outline-none transition-colors"
                />
                {address && inputAddr !== address && (
                  <button onClick={() => { wasManuallyEdited.current = false; setInputAddr(address); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-polkadot-pink hover:opacity-70 bg-polkadot-pink/10 px-2 py-1 rounded-lg transition-all">
                    ↺ reset
                  </button>
                )}
              </div>

              {isMismatch && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2.5 space-y-1.5">
                  <p className="text-[10px] font-semibold text-amber-400">⚠ Address mismatch — minting will fail</p>
                  <p className="text-[9px] text-amber-400/70 leading-relaxed">
                    MetaMask: <span className="font-mono">{address?.slice(0,6)}…{address?.slice(-4)}</span>
                    {' '}vs scoring{' '}
                    <span className="font-mono">{inputAddr.slice(0,6)}…{inputAddr.slice(-4)}</span>.
                    Contract requires signer = scored wallet.
                  </p>
                  <button onClick={() => { wasManuallyEdited.current = false; setInputAddr(address!); }}
                    className="text-[9px] font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 px-3 py-1.5 rounded-lg transition-all">
                    ↺ Use my connected wallet
                  </button>
                </div>
              )}

              <button
                onClick={() => requestScore(inputAddr)}
                disabled={isLoading || isMismatch || !inputAddr.startsWith('0x') || inputAddr.length !== 42 || isRateLimitError}
                className="w-full py-3 bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_12px_rgba(230,0,122,0.2)] hover:shadow-[0_0_18px_rgba(230,0,122,0.35)]"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    {status === 'waiting'            ? 'Confirm in MetaMask…'
                     : status === 'relay_auth'       ? 'Sign Auth (free)…'
                     : status === 'relay_submitting' ? 'Relaying…'
                     : status === 'confirming'       ? 'Waiting for block…'
                     : 'Processing…'}
                  </span>
                ) : 'Generate Score'}
              </button>
            </div>
          </div>

          {/* Stage progress — compact pill row */}
          {isLoading && (
            <div className="bg-polkadot-card border border-polkadot-border rounded-2xl px-4 py-3">
              <div className="flex items-center gap-1">
                {STAGES.map((stage, i) => {
                  const done   = currentStageI > i;
                  const active = currentStageI === i;
                  return (
                    <div key={stage.key} className="flex items-center flex-1 min-w-0">
                      <div className="flex flex-col items-center gap-1 w-full min-w-0">
                        <div className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-all ${
                          done   ? 'border-emerald-600 bg-emerald-500/10'
                          : active ? 'border-polkadot-pink bg-polkadot-pink/10'
                          :          'border-white/8 bg-transparent'
                        }`}>
                          {done ? (
                            <svg className="h-3 w-3 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                            </svg>
                          ) : active ? (
                            <svg className="animate-spin h-3 w-3 text-polkadot-pink" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                            </svg>
                          ) : (
                            <div className="w-1 h-1 rounded-full bg-white/10"/>
                          )}
                        </div>
                        <span className={`text-[7px] font-bold uppercase tracking-wide truncate w-full text-center hidden sm:block ${
                          done ? 'text-emerald-500' : active ? 'text-polkadot-pink' : 'text-gray-700'
                        }`}>{stage.label}</span>
                      </div>
                      {i < STAGES.length - 1 && (
                        <div className={`h-px w-full mb-4 sm:mb-4 transition-colors ${done ? 'bg-emerald-800' : 'bg-white/5'}`}/>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* MetaMask prompt banners */}
          {status === 'waiting' && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3 space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0"/>
                <span className="text-xs font-semibold text-amber-400">Check MetaMask — confirm to mint</span>
              </div>
              {gasEstimate ? (
                <p className="text-[9px] text-amber-600 font-mono pl-4.5">
                  Fee: <span className="text-amber-400">{gasEstimate.pas} PAS</span>
                  <span className="ml-1">(~${gasEstimate.usd})</span>
                </p>
              ) : (
                <p className="text-[9px] text-amber-700 pl-4.5">Calculating fee…</p>
              )}
            </div>
          )}
          {status === 'relay_auth' && (
            <div className="flex items-center gap-2 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3">
              <span className="w-2.5 h-2.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0"/>
              <span className="text-xs font-semibold text-blue-400">Check MetaMask — sign free authorization</span>
            </div>
          )}
          {status === 'relay_submitting' && (
            <div className="flex items-center gap-2 bg-polkadot-pink/5 border border-polkadot-pink/15 rounded-xl px-4 py-3">
              <span className="w-2.5 h-2.5 border-2 border-polkadot-pink border-t-transparent rounded-full animate-spin shrink-0"/>
              <span className="text-xs font-semibold text-polkadot-pink">Backend minting on-chain — gasless relay</span>
            </div>
          )}

          {/* Idle: how it works */}
          {status === 'idle' && (
            <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-polkadot-border bg-black/20">
                <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">How it works</span>
              </div>
              <div className="px-4 py-3 space-y-3">
                {HOW_IT_WORKS.map(([num, title, desc]) => (
                  <div key={num} className="flex gap-3">
                    <span className="text-polkadot-pink font-black font-mono text-xs w-6 shrink-0 mt-0.5">{num}</span>
                    <div>
                      <span className="text-xs font-semibold text-white">{title} — </span>
                      <span className="text-xs text-gray-500">{desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Rate limit ─────────────────────────────────────────────────── */}
      {status === 'error' && isRateLimitError && (
        <div className="bg-polkadot-card border border-orange-500/20 rounded-2xl p-6 text-center space-y-4">
          <div className="text-3xl">⏳</div>
          <div>
            <div className="text-sm font-bold text-white">Too Many Attempts</div>
            <div className="text-[10px] text-gray-600 mt-0.5">Please wait before requesting another score.</div>
          </div>
          <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl px-5 py-3 inline-block">
            <div className="text-[8px] font-bold uppercase tracking-widest text-orange-500 mb-0.5">Try again in</div>
            <div className="font-mono font-black text-orange-300 text-3xl tracking-tight">
              {rateLimitSec !== null && rateLimitSec > 0 ? formatWait(rateLimitSec) : 'now'}
            </div>
          </div>
          <div>
            <button onClick={reset} className="text-[9px] text-gray-600 hover:text-gray-400 underline transition-colors">Dismiss</button>
          </div>
        </div>
      )}

      {/* ── Retry available ────────────────────────────────────────────── */}
      {status === 'error' && error === 'retry_available' && (
        <div className="bg-polkadot-card border border-yellow-500/20 rounded-2xl p-5 text-center space-y-3">
          <div className="text-2xl">⚡</div>
          <div>
            <div className="text-sm font-bold text-white">Score Ready — Mint Pending</div>
            <div className="text-[10px] text-gray-600 mt-0.5">Score generated but mint didn't complete.</div>
          </div>
          <button onClick={() => retryMint()}
            className="w-full py-3 bg-polkadot-pink hover:bg-pink-600 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_12px_rgba(230,0,122,0.2)]">
            ↻ Reopen MetaMask — Finish Minting
          </button>
          <button onClick={reset} className="text-[9px] text-gray-600 hover:text-gray-400 underline transition-colors">Start over</button>
        </div>
      )}

      {/* ── Generic error ──────────────────────────────────────────────── */}
      {status === 'error' && error && !isRateLimitError && error !== 'retry_available' && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <span className="text-red-400 shrink-0 mt-0.5">⚠</span>
            <div>
              <div className="text-xs font-semibold text-red-400">Something went wrong</div>
              <div className="text-[10px] text-red-400/60 mt-0.5 leading-relaxed">{error}</div>
            </div>
          </div>
          {hasCachedPayload ? (
            <div className="space-y-1.5">
              <button onClick={() => retryMint()}
                className="w-full py-2.5 bg-polkadot-pink hover:bg-pink-600 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all">
                ↻ Retry mint
              </button>
              <button onClick={reset}
                className="w-full py-2 bg-red-500/5 border border-red-500/20 text-red-400 font-bold text-[9px] uppercase tracking-widest rounded-xl transition-all">
                Start over
              </button>
            </div>
          ) : (
            <button onClick={reset}
              className="w-full py-2 bg-red-500/5 border border-red-500/20 text-red-400 font-bold text-[9px] uppercase tracking-widest rounded-xl transition-all">
              Try again
            </button>
          )}
        </div>
      )}

      {/* ── Cooldown ───────────────────────────────────────────────────── */}
      {status === 'cooldown' && (
        <div className="bg-polkadot-card border border-yellow-500/20 rounded-2xl p-6 text-center space-y-4">
          <div className="text-3xl">🔒</div>
          <div>
            <div className="text-sm font-bold text-white">Score Already Valid</div>
            <div className="text-[10px] text-gray-600 mt-0.5">Your VeraScore NFT is active. Refresh after cooldown.</div>
          </div>
          {cooldownTs && cooldownTs > 0 ? (
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-5 py-3 inline-block">
              <div className="text-[8px] font-bold uppercase tracking-widest text-yellow-500 mb-0.5">Refresh available</div>
              <div className="font-mono font-black text-yellow-300 text-2xl tracking-tight">{liveRemaining(cooldownTs)}</div>
              <div className="text-[9px] text-yellow-700 mt-0.5">{fmt(cooldownTs)}</div>
            </div>
          ) : (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-5 py-2 inline-block">
              <div className="text-xs font-semibold text-emerald-400">✓ Refresh available now</div>
            </div>
          )}
          <div className="text-[10px] text-gray-600">
            View score in{' '}
            <button onClick={() => onNavigate('lookup')} className="text-polkadot-pink hover:opacity-70 transition-opacity">Lookup</button>.
          </div>
          <button onClick={reset}
            className="w-full py-2.5 border border-polkadot-border hover:border-gray-500 text-gray-500 hover:text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all">
            Back
          </button>
        </div>
      )}

      {/* ── Done ───────────────────────────────────────────────────────── */}
      {payload && status === 'done' && (
        <div className="space-y-4">
          <div className={`rounded-xl px-4 py-3 text-xs font-semibold text-center ${
            payload.alreadyHadScore
              ? 'bg-blue-500/5 border border-blue-500/20 text-blue-400'
              : 'bg-emerald-500/5 border border-emerald-500/20 text-emerald-400'
          }`}>
            {payload.alreadyHadScore
              ? '✓ Score updated — soulbound NFT refreshed on-chain'
              : '✓ Soulbound Score NFT minted to your wallet'}
          </div>

          <ScoreCard payload={payload} expiresAt={payload.expiresAt} />

          {payload.wallet && payload.score > 0 && (
            <NFTViewer
              wallet={payload.wallet}
              proxyAddress={SCORE_NFT_PROXY as `0x${string}`}
              label="Your Score NFT"
              initialDelay={payload.txHash ? 3000 : 500}
            />
          )}

          {historyForChart.length > 0 && <HistoryChart history={historyForChart} />}

          {payload.relayed && (
            <div className="bg-polkadot-pink/5 border border-polkadot-pink/15 rounded-xl px-4 py-2.5 text-[10px] font-semibold text-polkadot-pink text-center">
              ✅ Minted via gasless relay — paid with USDT, zero PAS required
            </div>
          )}

          {payload.txHash && (
            <div className="flex items-center justify-center gap-4">
              <a href={`${EXPLORER}/tx/${payload.txHash}`} target="_blank" rel="noopener noreferrer"
                className="text-[9px] font-bold text-polkadot-pink hover:opacity-70 transition-opacity uppercase tracking-widest">
                View Mint Tx ↗
              </a>
              <span className="text-gray-800">·</span>
              <a href={`${EXPLORER}/address/${SCORE_NFT_PROXY}`} target="_blank" rel="noopener noreferrer"
                className="text-[9px] font-bold text-gray-600 hover:text-polkadot-pink transition-colors uppercase tracking-widest">
                Contract ↗
              </a>
            </div>
          )}

          <button onClick={() => { reset(); setFullHistory([]); }}
            className="w-full py-2.5 border border-polkadot-border hover:border-gray-500 text-gray-500 hover:text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all">
            Score Again
          </button>
        </div>
      )}
    </div>
  );
}