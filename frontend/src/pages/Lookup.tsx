import { useState }          from 'react';
import { HistoryChart }       from '../components/HistoryChart.js';
import { NFTViewer }         from '../components/NFTViewer.js';
import { SCORE_NFT_PROXY }    from '../utils/wagmi.js';
import type { HistoryRecord } from '../types/index.js';

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
  if (s >= 750) return 'text-green-400';
  if (s >= 500) return 'text-yellow-400';
  if (s >= 250) return 'text-orange-400';
  return 'text-red-400';
}
function scoreBg(s: number) {
  if (s >= 750) return 'bg-green-400';
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
  return new Date(ts * 1000).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtFull(ts: number) { return new Date(ts * 1000).toLocaleString(); }
function isValidAddr(a: string) { return a.startsWith('0x') && a.length === 42; }

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
    </svg>
  );
}

function ResultCard({ result, compact = false, showNFT = true, showHistory = true }:
  { result: LookupResult; compact?: boolean; showNFT?: boolean; showHistory?: boolean }) {

  if (!result.hasScore || result.score === undefined) {
    return (
      <div className="bg-polkadot-card border border-polkadot-border rounded-2xl p-6 text-center space-y-2">
        <div className="text-3xl">🔍</div>
        <div className="text-gray-300 font-medium">No score found</div>
        <div className="text-gray-600 text-xs font-mono break-all">{result.address}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
        <div className={`px-6 ${compact ? 'pt-5 pb-4' : 'pt-8 pb-6'} border-b border-polkadot-border text-center space-y-3`}>
          <div className={`${compact ? 'text-5xl' : 'text-7xl'} font-bold font-mono ${scoreColor(result.score)}`}>
            {result.score}
          </div>
          <div className="text-gray-500 text-xs">out of 1100</div>
          <div className="max-w-xs mx-auto">
            <div className="h-2 bg-polkadot-border rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ${scoreBg(result.score)}`}
                style={{ width: `${Math.min((result.score / 1100) * 100, 100)}%` }} />
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${
              result.score >= 750 ? 'border-green-800 text-green-400 bg-green-950' :
              result.score >= 500 ? 'border-yellow-800 text-yellow-400 bg-yellow-950' :
              result.score >= 250 ? 'border-orange-800 text-orange-400 bg-orange-950' :
                                    'border-red-800 text-red-400 bg-red-950'}`}>
              {scoreLabel(result.score)}
            </span>
            {result.isValid
              ? <span className="text-xs font-semibold px-3 py-1 rounded-full border border-green-800 text-green-400 bg-green-950">✓ Valid</span>
              : <span className="text-xs font-semibold px-3 py-1 rounded-full border border-red-800 text-red-400 bg-red-950">✗ Expired</span>}
          </div>
        </div>

        {!compact && (
          <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs border-b border-polkadot-border">
            {([
              ['Address', <span className="font-mono text-gray-300 truncate max-w-[220px] block">{result.address}</span>],
              ['Issued',  <span className="text-gray-300">{fmtFull(result.issuedAt ?? 0)}</span>],
              [result.isValid ? 'Expires' : 'Expired',
                <span className={result.isValid ? 'text-green-400' : 'text-red-400'}>{fmt(result.expiresAt ?? 0)}</span>],
              ['Total scored', <span className="text-gray-300">{result.totalScored} wallets</span>],
            ] as [string, React.ReactNode][]).map(([label, value], i) => (
              <div key={i} className="flex justify-between items-start gap-4">
                <span className="text-gray-500 shrink-0">{label}</span>
                <span className="text-right">{value}</span>
              </div>
            ))}
          </div>
        )}

        <div className="px-6 py-4">
          {result.refreshAvailableAt && result.refreshAvailableAt > 0 ? (
            <div className="bg-yellow-950 border border-yellow-800 rounded-xl px-4 py-2.5 text-xs text-yellow-300 text-center">
              🔒 Refresh locked until <span className="font-semibold">{fmt(result.refreshAvailableAt)}</span>
            </div>
          ) : !result.isValid ? (
            <div className="bg-blue-950 border border-blue-800 rounded-xl px-4 py-2.5 text-xs text-blue-300 text-center">
              Score expired — wallet owner can generate a new score on the Score tab
            </div>
          ) : (
            <div className="bg-green-950 border border-green-800 rounded-xl px-4 py-2.5 text-xs text-green-300 text-center">
              ✓ Score is live and verifiable on-chain
            </div>
          )}
        </div>
      </div>

      {showNFT  && result.score > 0 && <NFTViewer wallet={result.address} proxyAddress={SCORE_NFT_PROXY as `0x${string}`} />}
      {showHistory && (result.history ?? []).length > 0 && <HistoryChart history={result.history!} />}

      {!compact && (
        <div className="flex items-center justify-center gap-4 text-xs">
          <a href={`${EXPLORER}/address/${result.address}`} target="_blank" rel="noopener noreferrer"
            className="text-gray-500 hover:text-polkadot-pink transition-colors">View wallet ↗</a>
          <span className="text-gray-700">·</span>
          <a href={`${EXPLORER}/address/${SCORE_NFT_PROXY}`} target="_blank" rel="noopener noreferrer"
            className="text-gray-500 hover:text-polkadot-pink transition-colors">View contract ↗</a>
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
    ['Issued',  a.issuedAt ? fmt(a.issuedAt) : '—',   b.issuedAt ? fmt(b.issuedAt) : '—'],
    ['Expires', a.expiresAt ? fmt(a.expiresAt) : '—', b.expiresAt ? fmt(b.expiresAt) : '—'],
  ];
  return (
    <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-polkadot-border">
        <div className="text-xs text-gray-500 uppercase tracking-widest">Head-to-Head</div>
      </div>
      <div className="grid grid-cols-3 px-6 py-3 border-b border-polkadot-border text-xs text-gray-500">
        <div>Metric</div>
        <div className={`text-center font-mono truncate ${winner === 'a' ? 'text-polkadot-pink font-semibold' : ''}`}>
          {winner === 'a' && '🏆 '}{a.address.slice(0,8)}…
        </div>
        <div className={`text-center font-mono truncate ${winner === 'b' ? 'text-polkadot-pink font-semibold' : ''}`}>
          {winner === 'b' && '🏆 '}{b.address.slice(0,8)}…
        </div>
      </div>
      {rows.map(([label, va, vb]) => {
        const isScore = label === 'Score';
        const aWins = isScore && Number(va) >= Number(vb);
        const bWins = isScore && Number(vb) > Number(va);
        return (
          <div key={label} className="grid grid-cols-3 px-6 py-2.5 border-b border-polkadot-border/40 text-xs last:border-0">
            <div className="text-gray-500">{label}</div>
            <div className={`text-center font-mono ${aWins ? scoreColor(Number(va)) + ' font-bold' : 'text-gray-300'}`}>{va}</div>
            <div className={`text-center font-mono ${bWins ? scoreColor(Number(vb)) + ' font-bold' : 'text-gray-300'}`}>{vb}</div>
          </div>
        );
      })}
      <div className="px-6 py-4 bg-polkadot-dark text-center text-xs text-gray-400">
        Score difference:{' '}
        <span className="font-mono font-bold text-white">{Math.abs(a.score - b.score)} pts</span>
        {' '}in favour of{' '}
        <span className="font-mono text-polkadot-pink">{(winner === 'a' ? a : b).address.slice(0,10)}…</span>
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
        const res  = await fetch(`/score/${addr}`);
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-10">
      <div className="max-w-5xl mx-auto space-y-8">

        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">
            Public <span className="text-polkadot-pink">Score Lookup</span>
          </h2>
          <p className="text-gray-400 text-sm">Check any wallet's on-chain VeraScore. No wallet connection needed.</p>
        </div>

        {/* Mode toggle */}
        <div className="flex justify-center">
          <div className="bg-polkadot-card border border-polkadot-border rounded-xl p-1 flex gap-1">
            {(['single','compare'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === m ? 'bg-polkadot-pink text-white' : 'text-gray-400 hover:text-white'}`}>
                {m === 'single' ? '🔍 Single' : '⚖️ Compare'}
              </button>
            ))}
          </div>
        </div>

        {/* SINGLE */}
        {mode === 'single' && (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="flex gap-2">
              <input type="text" placeholder="0x... wallet address" value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !loading && handleLookup()}
                className="flex-1 bg-polkadot-card border border-polkadot-border rounded-xl px-4 py-3 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-polkadot-pink transition-colors" />
              <button onClick={handleLookup} disabled={loading || !input.trim()}
                className="bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-xl transition-colors shrink-0">
                {loading ? <Spinner /> : 'Look Up'}
              </button>
            </div>
            {error && <div className="bg-red-950 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}
            {result && !result.hasScore && (
              <div className="bg-polkadot-card border border-polkadot-border rounded-2xl p-8 text-center space-y-3">
                <div className="text-4xl">🔍</div>
                <div className="text-gray-300 font-medium text-lg">No score found</div>
                <div className="text-gray-600 text-xs font-mono break-all">{result.address}</div>
                <div className="text-gray-600 text-sm">Total wallets scored: <span className="text-gray-400 font-semibold">{result.totalScored}</span></div>
              </div>
            )}
            {result?.hasScore && <ResultCard result={result} />}
          </div>
        )}

        {/* COMPARE */}
        {mode === 'compare' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([['A', inputA, setInputA], ['B', inputB, setInputB]] as [string, string, typeof setInputA][]).map(([lbl, val, setter]) => (
                <div key={lbl} className="space-y-1.5">
                  <div className="text-xs text-gray-500 uppercase tracking-widest px-1">Wallet {lbl}</div>
                  <input type="text" placeholder={`0x... wallet ${lbl}`} value={val}
                    onChange={e => setter(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !comparing && handleCompare()}
                    className="w-full bg-polkadot-card border border-polkadot-border rounded-xl px-4 py-3 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-polkadot-pink transition-colors" />
                </div>
              ))}
            </div>

            <button onClick={handleCompare} disabled={comparing || !inputA.trim() || !inputB.trim()}
              className="w-full bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors">
              {comparing
                ? <span className="flex items-center justify-center gap-2"><Spinner /> Comparing…</span>
                : '⚖️ Compare Wallets'}
            </button>

            {errorC && <div className="bg-red-950 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm">{errorC}</div>}

            {(resultA || resultB || loadingA || loadingB) && (
              <div className="space-y-6">
                {resultA?.hasScore && resultB?.hasScore && <CompareTable a={resultA} b={resultB} />}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(['A','B'] as const).map(lbl => {
                    const loading_ = lbl === 'A' ? loadingA : loadingB;
                    const result_  = lbl === 'A' ? resultA  : resultB;
                    return (
                      <div key={lbl} className="space-y-2">
                        <div className="text-xs text-gray-500 uppercase tracking-widest text-center">
                          {loading_ ? '⏳ Loading…' : `Wallet ${lbl}`}
                        </div>
                        {loading_ ? (
                          <div className="bg-polkadot-card border border-polkadot-border rounded-2xl p-8 flex justify-center">
                            <Spinner />
                          </div>
                        ) : result_ ? (
                          <ResultCard result={result_} compact showNFT={false} showHistory={false} />
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {resultA?.hasScore && resultB?.hasScore && (
                  <div className="flex items-center justify-center gap-4 text-xs">
                    <a href={`${EXPLORER}/address/${resultA.address}`} target="_blank" rel="noopener noreferrer"
                      className="text-gray-500 hover:text-polkadot-pink transition-colors">Wallet A ↗</a>
                    <span className="text-gray-700">·</span>
                    <a href={`${EXPLORER}/address/${resultB.address}`} target="_blank" rel="noopener noreferrer"
                      className="text-gray-500 hover:text-polkadot-pink transition-colors">Wallet B ↗</a>
                    <span className="text-gray-700">·</span>
                    <a href={`${EXPLORER}/address/${SCORE_NFT_PROXY}`} target="_blank" rel="noopener noreferrer"
                      className="text-gray-500 hover:text-polkadot-pink transition-colors">Contract ↗</a>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}