import { useState }          from 'react';
import { HistoryChart }       from '../components/HistoryChart';
import { NFTViewer }          from '../components/NFTViewer';
import { SCORE_NFT_PROXY }    from '../utils/wagmi';
import type { HistoryRecord } from '../types/index';

const EXPLORER = 'https://polkadot.testnet.routescan.io';

interface LookupResult {
  success:             boolean;
  hasScore:            boolean;
  address:             string;
  score?:              number;
  issuedAt?:           number;
  expiresAt?:          number;
  dataHash?:           string;
  isValid?:            boolean;
  refreshAvailableAt?: number;
  totalScored:         number;
  history?:            HistoryRecord[];
}

function scoreColor(s: number) {
  if (s >= 750) return 'text-emerald-400';
  if (s >= 500) return 'text-yellow-400';
  if (s >= 250) return 'text-orange-400';
  return 'text-red-400';
}
function scoreBg(s: number) {
  if (s >= 750) return 'bg-emerald-400';
  if (s >= 500) return 'bg-yellow-400';
  if (s >= 250) return 'bg-orange-400';
  return 'bg-red-400';
}
function scoreLabel(s: number) {
  if (s >= 750) return 'Excellent';
  if (s >= 500) return 'Good';
  if (s >= 250) return 'Fair';
  return 'New Wallet';
}
function fmt(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtFull(ts: number) { return new Date(ts * 1000).toLocaleString(); }
function isValidAddr(a: string) { return a.startsWith('0x') && a.length === 42; }

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
    </svg>
  );
}

function ResultCard({ result, compact = false, showNFT = true, showHistory = true }:
  { result: LookupResult; compact?: boolean; showNFT?: boolean; showHistory?: boolean }) {

  if (!result.hasScore || result.score === undefined) {
    return (
      <div className="bg-polkadot-card border border-polkadot-border rounded-2xl p-8 text-center space-y-2">
        <div className="text-3xl">🔍</div>
        <div className="text-xs font-semibold text-gray-500">No Score Found</div>
        <div className="text-gray-700 text-[10px] font-mono break-all">{result.address}</div>
      </div>
    );
  }

  const pct = Math.min((result.score / 1100) * 100, 100);

  return (
    <div className="space-y-3">
      {/* Score card */}
      <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden shadow-xl">

        {/* Score hero — compact */}
        <div className={`px-5 ${compact ? 'pt-5 pb-4' : 'pt-6 pb-5'} border-b border-polkadot-border text-center space-y-3`}>
          <div className={`${compact ? 'text-4xl' : 'text-6xl'} font-black font-mono tracking-tight ${scoreColor(result.score)}`}>
            {result.score}
          </div>
          <div className="text-[8px] font-bold text-gray-700 uppercase tracking-widest">out of 1100</div>

          {/* Progress bar */}
          <div className="max-w-48 mx-auto">
            <div className="h-1 bg-black/40 rounded-full overflow-hidden border border-white/5">
              <div className={`h-full rounded-full transition-all duration-700 ${scoreBg(result.score)}`}
                style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Badges */}
          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            <span className={`text-[8px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-wide ${
              result.score >= 750 ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5' :
              result.score >= 500 ? 'border-yellow-500/30  text-yellow-400  bg-yellow-500/5'  :
              result.score >= 250 ? 'border-orange-500/30  text-orange-400  bg-orange-500/5'  :
                                    'border-red-500/30     text-red-400     bg-red-500/5'}`}>
              {scoreLabel(result.score)}
            </span>
            {result.isValid
              ? <span className="text-[8px] font-bold px-2.5 py-1 rounded-full border border-emerald-500/30 text-emerald-400 bg-emerald-500/5 uppercase tracking-wide">✓ Valid</span>
              : <span className="text-[8px] font-bold px-2.5 py-1 rounded-full border border-red-500/30 text-red-400 bg-red-500/5 uppercase tracking-wide">✗ Expired</span>}
          </div>
        </div>

        {/* Details grid */}
        {!compact && (
          <div className="grid grid-cols-2 gap-px bg-polkadot-border border-b border-polkadot-border">
            {([
              ['Address',      <span className="font-mono text-white text-[10px]">{result.address.slice(0,10)}…{result.address.slice(-6)}</span>],
              ['Issued',       <span className="text-gray-400 text-[10px]">{fmtFull(result.issuedAt ?? 0)}</span>],
              [result.isValid ? 'Expires' : 'Expired',
                               <span className={`text-[10px] ${result.isValid ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(result.expiresAt ?? 0)}</span>],
              ['Total Scored', <span className="text-gray-400 text-[10px]">{result.totalScored} wallets</span>],
            ] as [string, React.ReactNode][]).map(([label, value], i) => (
              <div key={i} className="bg-polkadot-card px-4 py-3 space-y-1">
                <div className="text-[8px] font-bold text-gray-700 uppercase tracking-widest">{label}</div>
                <div>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Status banner */}
        <div className="px-4 py-3">
          {result.refreshAvailableAt && result.refreshAvailableAt > 0 ? (
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-3 py-2 text-[9px] font-semibold text-yellow-400 text-center">
              🔒 Refresh locked until {fmt(result.refreshAvailableAt)}
            </div>
          ) : !result.isValid ? (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl px-3 py-2 text-[9px] font-semibold text-blue-400 text-center">
              Score expired — wallet owner can refresh on the Score tab
            </div>
          ) : (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-3 py-2 text-[9px] font-semibold text-emerald-400 text-center">
              ✓ Live &amp; verifiable on-chain
            </div>
          )}
        </div>
      </div>

      {showNFT && result.score > 0 && (
        <NFTViewer wallet={result.address} proxyAddress={SCORE_NFT_PROXY as `0x${string}`} label="Score NFT" initialDelay={500} />
      )}
      {showHistory && (result.history ?? []).length > 0 && (
        <HistoryChart history={result.history!} />
      )}

      {!compact && (
        <div className="flex items-center justify-center gap-4">
          <a href={`${EXPLORER}/address/${result.address}`} target="_blank" rel="noopener noreferrer"
            className="text-[9px] font-bold uppercase tracking-widest text-gray-600 hover:text-polkadot-pink transition-colors">
            View Wallet ↗
          </a>
          <span className="text-gray-800">·</span>
          <a href={`${EXPLORER}/address/${SCORE_NFT_PROXY}`} target="_blank" rel="noopener noreferrer"
            className="text-[9px] font-bold uppercase tracking-widest text-gray-600 hover:text-polkadot-pink transition-colors">
            View Contract ↗
          </a>
        </div>
      )}
    </div>
  );
}

function CompareTable({ a, b }: { a: LookupResult; b: LookupResult }) {
  if (!a.hasScore || !b.hasScore || a.score === undefined || b.score === undefined) return null;
  const winner = a.score >= b.score ? 'a' : 'b';
  const rows: [string, string, string][] = [
    ['Score',   a.score.toString(),                   b.score.toString()],
    ['Rating',  scoreLabel(a.score),                  scoreLabel(b.score)],
    ['Valid',   a.isValid ? '✓ Valid' : '✗ Expired',  b.isValid ? '✓ Valid' : '✗ Expired'],
    ['Issued',  a.issuedAt  ? fmt(a.issuedAt)  : '—', b.issuedAt  ? fmt(b.issuedAt)  : '—'],
    ['Expires', a.expiresAt ? fmt(a.expiresAt) : '—', b.expiresAt ? fmt(b.expiresAt) : '—'],
  ];
  return (
    <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden shadow-xl">
      <div className="px-4 py-3 border-b border-polkadot-border bg-black/20 flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Head-to-Head</span>
        <span className="text-xs font-black text-polkadot-pink font-mono">Δ {Math.abs(a.score - b.score)} pts</span>
      </div>
      <div className="grid grid-cols-3 px-4 py-2.5 border-b border-polkadot-border bg-black/10">
        <div className="text-[8px] font-bold uppercase tracking-widest text-gray-700">Metric</div>
        <div className={`text-[8px] font-bold uppercase tracking-widest text-center truncate ${winner === 'a' ? 'text-polkadot-pink' : 'text-gray-600'}`}>
          {winner === 'a' && '🏆 '}{a.address.slice(0,8)}…
        </div>
        <div className={`text-[8px] font-bold uppercase tracking-widest text-center truncate ${winner === 'b' ? 'text-polkadot-pink' : 'text-gray-600'}`}>
          {winner === 'b' && '🏆 '}{b.address.slice(0,8)}…
        </div>
      </div>
      {rows.map(([label, va, vb]) => {
        const isScore = label === 'Score';
        const aWins   = isScore && Number(va) >= Number(vb);
        const bWins   = isScore && Number(vb) >  Number(va);
        return (
          <div key={label} className="grid grid-cols-3 px-4 py-2.5 border-b border-polkadot-border/40 last:border-0">
            <div className="text-[9px] font-bold text-gray-600">{label}</div>
            <div className={`text-[10px] font-bold font-mono text-center ${aWins ? scoreColor(Number(va)) : 'text-gray-400'}`}>{va}</div>
            <div className={`text-[10px] font-bold font-mono text-center ${bWins ? scoreColor(Number(vb)) : 'text-gray-400'}`}>{vb}</div>
          </div>
        );
      })}
      <div className="px-4 py-3 bg-black/20 text-center text-[9px] font-semibold text-gray-500">
        Winner: <span className="text-polkadot-pink font-mono">{(winner === 'a' ? a : b).address.slice(0, 10)}…</span>
      </div>
    </div>
  );
}

export function Lookup() {
  const [mode, setMode] = useState<'single' | 'compare'>('single');

  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<LookupResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  const [inputA,   setInputA]   = useState('');
  const [inputB,   setInputB]   = useState('');
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [resultA,  setResultA]  = useState<LookupResult | null>(null);
  const [resultB,  setResultB]  = useState<LookupResult | null>(null);
  const [errorC,   setErrorC]   = useState<string | null>(null);

  async function handleLookup() {
    const addr = input.trim();
    if (!isValidAddr(addr)) { setError('Enter a valid 0x address (42 chars)'); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const res  = await fetch(`/score/${addr}`);
      const json = await res.json() as LookupResult;
      if (!res.ok) throw new Error('Lookup failed. Please try again.');
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
    } finally { setLoading(false); }
  }

  async function handleCompare() {
    const addrA = inputA.trim(), addrB = inputB.trim();
    if (!isValidAddr(addrA) || !isValidAddr(addrB)) {
      setErrorC('Both addresses must be valid 0x addresses (42 chars)'); return;
    }
    if (addrA.toLowerCase() === addrB.toLowerCase()) {
      setErrorC('Enter two different wallet addresses'); return;
    }
    setErrorC(null); setResultA(null); setResultB(null);
    setLoadingA(true); setLoadingB(true);
    const fetchOne = async (addr: string, setRes: typeof setResultA, setLoad: typeof setLoadingA) => {
      try {
        const res = await fetch(`/score/${addr}`);
        setRes(await res.json() as LookupResult);
      } catch { setRes(null); }
      finally { setLoad(false); }
    };
    await Promise.all([
      fetchOne(addrA, setResultA, setLoadingA),
      fetchOne(addrB, setResultB, setLoadingB),
    ]);
  }

  const comparing = loadingA || loadingB;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">

      {/* Header — same compact style as Home */}
      <div>
        <h1 className="text-xl font-black tracking-tight text-white">
          Score <span className="text-polkadot-pink">Lookup</span>
        </h1>
        <p className="text-[10px] text-gray-600 mt-0.5 font-medium">
          Check any wallet · No connection needed
        </p>
      </div>

      {/* Mode toggle */}
      <div className="bg-polkadot-card border border-polkadot-border rounded-xl p-1 flex gap-1 w-fit">
        {(['single', 'compare'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-5 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${
              mode === m
                ? 'bg-polkadot-pink text-white shadow-[0_0_10px_rgba(230,0,122,0.25)]'
                : 'text-gray-600 hover:text-gray-300'
            }`}>
            {m === 'single' ? '⌕ Single' : '⚖ Compare'}
          </button>
        ))}
      </div>

      {/* ── Single ─────────────────────────────────────────────────── */}
      {mode === 'single' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="0x… wallet address"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !loading && handleLookup()}
              className="flex-1 bg-polkadot-card border border-polkadot-border rounded-xl px-4 py-2.5 text-xs font-mono text-white placeholder-gray-700 focus:outline-none focus:border-polkadot-pink/40 transition-colors"
            />
            <button
              onClick={handleLookup}
              disabled={loading || !input.trim()}
              className="bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-widest px-5 py-2.5 rounded-xl transition-all shadow-[0_0_12px_rgba(230,0,122,0.2)] shrink-0"
            >
              {loading ? <Spinner /> : 'Look Up'}
            </button>
          </div>

          {error && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-2.5 text-xs font-semibold text-red-400">
              ✗ {error}
            </div>
          )}

          {result && !result.hasScore && (
            <div className="bg-polkadot-card border border-polkadot-border rounded-2xl p-8 text-center space-y-2">
              <div className="text-3xl">🔍</div>
              <div className="text-xs font-semibold text-gray-500">No Score Found</div>
              <div className="text-gray-700 text-[10px] font-mono break-all">{result.address}</div>
              <div className="text-[9px] text-gray-700">
                Total wallets scored: <span className="text-gray-500">{result.totalScored}</span>
              </div>
            </div>
          )}

          {result?.hasScore && <ResultCard result={result} />}
        </div>
      )}

      {/* ── Compare ────────────────────────────────────────────────── */}
      {mode === 'compare' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([['A', inputA, setInputA], ['B', inputB, setInputB]] as [string, string, typeof setInputA][]).map(([lbl, val, setter]) => (
              <div key={lbl} className="space-y-1.5">
                <div className="text-[8px] font-bold uppercase tracking-widest text-gray-700">Wallet {lbl}</div>
                <input
                  type="text"
                  placeholder={`0x… wallet ${lbl}`}
                  value={val}
                  onChange={e => setter(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !comparing && handleCompare()}
                  className="w-full bg-polkadot-card border border-polkadot-border rounded-xl px-4 py-2.5 text-xs font-mono text-white placeholder-gray-700 focus:outline-none focus:border-polkadot-pink/40 transition-colors"
                />
              </div>
            ))}
          </div>

          <button
            onClick={handleCompare}
            disabled={comparing || !inputA.trim() || !inputB.trim()}
            className="w-full bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-widest py-3 rounded-xl transition-all shadow-[0_0_12px_rgba(230,0,122,0.2)]"
          >
            {comparing
              ? <span className="flex items-center justify-center gap-2"><Spinner /> Comparing…</span>
              : '⚖ Compare Wallets'}
          </button>

          {errorC && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-2.5 text-xs font-semibold text-red-400">
              ✗ {errorC}
            </div>
          )}

          {(resultA || resultB || loadingA || loadingB) && (
            <div className="space-y-4">
              {resultA?.hasScore && resultB?.hasScore && <CompareTable a={resultA} b={resultB} />}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(['A', 'B'] as const).map(lbl => {
                  const l = lbl === 'A' ? loadingA : loadingB;
                  const r = lbl === 'A' ? resultA  : resultB;
                  return (
                    <div key={lbl} className="space-y-1.5">
                      <div className="text-[8px] font-bold uppercase tracking-widest text-gray-700 text-center">
                        {l ? '⏳ Loading…' : `Wallet ${lbl}`}
                      </div>
                      {l ? (
                        <div className="bg-polkadot-card border border-polkadot-border rounded-2xl p-8 flex justify-center">
                          <Spinner />
                        </div>
                      ) : r ? (
                        <ResultCard result={r} compact showNFT={false} showHistory={false} />
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {resultA?.hasScore && resultB?.hasScore && (
                <div className="flex items-center justify-center gap-4">
                  <a href={`${EXPLORER}/address/${resultA.address}`} target="_blank" rel="noopener noreferrer"
                    className="text-[9px] font-bold uppercase tracking-widest text-gray-600 hover:text-polkadot-pink transition-colors">
                    Wallet A ↗
                  </a>
                  <span className="text-gray-800">·</span>
                  <a href={`${EXPLORER}/address/${resultB.address}`} target="_blank" rel="noopener noreferrer"
                    className="text-[9px] font-bold uppercase tracking-widest text-gray-600 hover:text-polkadot-pink transition-colors">
                    Wallet B ↗
                  </a>
                  <span className="text-gray-800">·</span>
                  <a href={`${EXPLORER}/address/${SCORE_NFT_PROXY}`} target="_blank" rel="noopener noreferrer"
                    className="text-[9px] font-bold uppercase tracking-widest text-gray-600 hover:text-polkadot-pink transition-colors">
                    Contract ↗
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}