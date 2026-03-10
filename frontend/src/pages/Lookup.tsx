import { useState }          from 'react';
import { HistoryChart }       from '../components/HistoryChart';
import { NFTViewer }         from '../components/NFTViewer';
import { SCORE_NFT_PROXY }    from '../utils/wagmi';
import type { HistoryRecord } from '../types';

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
  if (s >= 500) return 'text-amber-400';
  if (s >= 250) return 'text-orange-400';
  return 'text-red-400';
}

function scoreBg(s: number) {
  if (s >= 750) return 'bg-emerald-400';
  if (s >= 500) return 'bg-amber-400';
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
    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
  );
}

function ResultCard({ result, compact = false, showNFT = true, showHistory = true }:
  { result: LookupResult; compact?: boolean; showNFT?: boolean; showHistory?: boolean }) {

  if (!result.hasScore || result.score === undefined) {
    return (
      <div className="bg-polkadot-card border border-polkadot-border rounded-3xl p-10 text-center space-y-4 shadow-2xl">
        <div className="text-5xl opacity-20 italic font-black text-gray-500">NULL_DATA</div>
        <div className="space-y-1">
          <div className="text-gray-300 font-black uppercase tracking-widest text-sm">No VeraScore Found</div>
          <div className="text-gray-600 text-[10px] font-mono break-all max-w-xs mx-auto">{result.address}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-polkadot-card border border-polkadot-border rounded-3xl overflow-hidden shadow-2xl">
        <div className={`px-6 ${compact ? 'pt-6 pb-6' : 'pt-10 pb-8'} border-b border-polkadot-border text-center space-y-4 bg-gradient-to-b from-white/5 to-transparent`}>
          <div className={`${compact ? 'text-6xl' : 'text-8xl'} font-black font-mono tracking-tighter leading-none ${scoreColor(result.score)} drop-shadow-[0_0_15px_rgba(0,0,0,0.3)]`}>
            {result.score}
          </div>
          <div className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em]">Credit Rating <span className="text-gray-700">/ 1100</span></div>
          
          <div className="max-w-xs mx-auto">
            <div className="h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
              <div className={`h-full rounded-full transition-all duration-1000 ease-out ${scoreBg(result.score)}`}
                style={{ width: `${Math.min((result.score / 1100) * 100, 100)}%` }} />
            </div>
          </div>

          <div className="flex items-center justify-center gap-2">
            <span className={`text-[10px] font-black px-3 py-1 rounded-full border uppercase tracking-tight ${
              result.score >= 750 ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' :
              result.score >= 500 ? 'border-amber-500/30 text-amber-400 bg-amber-500/10' :
              'border-orange-500/30 text-orange-400 bg-orange-500/10'}`}>
              {scoreLabel(result.score)}
            </span>
            <span className={`text-[10px] font-black px-3 py-1 rounded-full border uppercase tracking-tight ${
              result.isValid ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-red-500/30 text-red-400 bg-red-500/10'}`}>
              {result.isValid ? '✦ Valid' : 'Expired'}
            </span>
          </div>
        </div>

        {!compact && (
          <div className="px-8 py-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-[10px] uppercase font-black border-b border-polkadot-border bg-black/10">
            {[
              ['Identity', <span className="font-mono text-gray-400 truncate lowercase">{result.address.slice(0, 12)}...{result.address.slice(-8)}</span>],
              ['Timestamp', <span className="text-gray-400 font-mono">{fmtFull(result.issuedAt ?? 0)}</span>],
              [result.isValid ? 'Expiry' : 'Expired On', <span className={result.isValid ? 'text-emerald-400 font-mono' : 'text-red-400 font-mono'}>{fmt(result.expiresAt ?? 0)}</span>],
              ['Network Stats', <span className="text-gray-400 font-mono">{result.totalScored} Scored</span>],
            ].map(([label, value], i) => (
              <div key={i} className="flex justify-between items-center border-b border-white/5 pb-2 last:border-0">
                <span className="text-gray-600 tracking-widest">{label}</span>
                <span className="text-right">{value}</span>
              </div>
            ))}
          </div>
        )}

        <div className="px-6 py-4">
          {result.refreshAvailableAt && result.refreshAvailableAt > Math.floor(Date.now()/1000) ? (
            <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl px-4 py-3 text-[10px] text-amber-500 font-black uppercase text-center tracking-widest">
              🔒 Lock Active · Refresh available {fmt(result.refreshAvailableAt)}
            </div>
          ) : (
            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl px-4 py-3 text-[10px] text-emerald-500 font-black uppercase text-center tracking-widest">
              ✦ VeraScore Live · Verified on Substrate
            </div>
          )}
        </div>
      </div>

      {showNFT && result.score > 0 && <NFTViewer wallet={result.address} proxyAddress={SCORE_NFT_PROXY as `0x${string}`} />}
      {showHistory && (result.history ?? []).length > 0 && <HistoryChart history={result.history!} />}
    </div>
  );
}

function CompareTable({ a, b }: { a: LookupResult; b: LookupResult }) {
  if (!a.hasScore || !b.hasScore || a.score === undefined || b.score === undefined) return null;
  const winner = a.score >= b.score ? 'a' : 'b';
  const rows: [string, string, string][] = [
    ['Score',   a.score.toString(),                   b.score.toString()],
    ['Rating',  scoreLabel(a.score),                  scoreLabel(b.score)],
    ['Status',  a.isValid ? 'Valid' : 'Expired',      b.isValid ? 'Valid' : 'Expired'],
    ['Issued',  a.issuedAt ? fmt(a.issuedAt) : '—',   b.issuedAt ? fmt(b.issuedAt) : '—'],
  ];
  return (
    <div className="bg-polkadot-card border border-polkadot-border rounded-3xl overflow-hidden shadow-2xl">
      <div className="px-6 py-4 border-b border-polkadot-border bg-white/5">
        <div className="text-[10px] text-gray-500 uppercase tracking-[0.2em] font-black">Head-to-Head Comparison</div>
      </div>
      <div className="grid grid-cols-3 px-8 py-4 border-b border-polkadot-border text-[10px] font-black uppercase tracking-widest bg-black/20">
        <div className="text-gray-600">Protocol Metric</div>
        <div className={`text-center truncate ${winner === 'a' ? 'text-polkadot-pink' : 'text-gray-500'}`}>
          {winner === 'a' && '🏆 '} {a.address.slice(0,6)}
        </div>
        <div className={`text-center truncate ${winner === 'b' ? 'text-polkadot-pink' : 'text-gray-500'}`}>
          {winner === 'b' && '🏆 '} {b.address.slice(0,6)}
        </div>
      </div>
      {rows.map(([label, va, vb]) => {
        const isScore = label === 'Score';
        const aWins = isScore && Number(va) >= Number(vb);
        const bWins = isScore && Number(vb) > Number(va);
        return (
          <div key={label} className="grid grid-cols-3 px-8 py-4 border-b border-white/5 text-[11px] font-bold last:border-0">
            <div className="text-gray-500 uppercase tracking-tighter">{label}</div>
            <div className={`text-center font-mono ${aWins ? scoreColor(Number(va)) : 'text-gray-300'}`}>{va}</div>
            <div className={`text-center font-mono ${bWins ? scoreColor(Number(vb)) : 'text-gray-300'}`}>{vb}</div>
          </div>
        );
      })}
      <div className="px-6 py-5 bg-polkadot-dark text-center">
        <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">
          Differential: <span className="text-white font-mono text-xs ml-1">+{Math.abs(a.score - b.score)} PTS</span>
        </span>
      </div>
    </div>
  );
}

export function Lookup() {
  const [mode, setMode] = useState<'single' | 'compare'>('single');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [inputA, setInputA] = useState('');
  const [inputB, setInputB] = useState('');
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [resultA, setResultA] = useState<LookupResult | null>(null);
  const [resultB, setResultB] = useState<LookupResult | null>(null);
  const [errorC, setErrorC] = useState<string | null>(null);

  async function handleLookup() {
    const addr = input.trim();
    if (!isValidAddr(addr)) { setError('Invalid EVM Address (0x + 40 chars)'); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch(`/score/${addr}`);
      const json = await res.json();
      if (!res.ok) throw new Error('Query Failed');
      setResult(json);
    } catch (err) {
      setError('Network error or address not found');
    } finally { setLoading(false); }
  }

  async function handleCompare() {
    const addrA = inputA.trim(), addrB = inputB.trim();
    if (!isValidAddr(addrA) || !isValidAddr(addrB)) {
      setErrorC('Both inputs must be valid 0x addresses'); return;
    }
    setErrorC(null); setResultA(null); setResultB(null);
    setLoadingA(true); setLoadingB(true);

    const fetchOne = async (addr: string, setRes: any, setLoad: any) => {
      try {
        const res = await fetch(`/score/${addr}`);
        setRes(await res.json());
      } catch { setRes(null); }
      finally { setLoad(false); }
    };

    await Promise.all([fetchOne(addrA, setResultA, setLoadingA), fetchOne(addrB, setResultB, setLoadingB)]);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="max-w-4xl mx-auto space-y-12">

        <div className="text-center space-y-3">
          <h2 className="text-4xl font-black tracking-tighter uppercase italic text-white">
            VeraScore <span className="text-polkadot-pink">Lookup</span>
          </h2>
          <p className="text-gray-500 text-xs font-black uppercase tracking-[0.3em]">Public Verifier · Substrate Native Data</p>
        </div>

        <div className="flex justify-center">
          <div className="bg-polkadot-card border border-polkadot-border rounded-2xl p-1.5 flex gap-1.5 shadow-lg">
            {(['single', 'compare'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  mode === m ? 'bg-polkadot-pink text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>
                {m === 'single' ? 'Identity' : 'Compare'}
              </button>
            ))}
          </div>
        </div>

        {mode === 'single' && (
          <div className="space-y-8 max-w-2xl mx-auto">
            <div className="flex gap-3">
              <input type="text" placeholder="ENTER 0x WALLET ADDRESS..." value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !loading && handleLookup()}
                className="flex-1 bg-polkadot-card border border-polkadot-border rounded-2xl px-6 py-4 text-sm font-mono text-white placeholder-gray-800 outline-none focus:border-polkadot-pink/40 shadow-inner transition-all" />
              <button onClick={handleLookup} disabled={loading || !input.trim()}
                className="bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 text-white font-black uppercase tracking-widest px-8 py-4 rounded-2xl transition-all shadow-lg active:scale-95">
                {loading ? <Spinner /> : 'VERIFY'}
              </button>
            </div>
            {error && <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-5 py-4 text-red-400 text-[10px] font-black uppercase text-center tracking-widest">{error}</div>}
            {result && <ResultCard result={result} />}
          </div>
        )}

        {mode === 'compare' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[['A', inputA, setInputA], ['B', inputB, setInputB]].map(([lbl, val, setter]: any) => (
                <div key={lbl} className="space-y-2">
                  <label className="text-[10px] text-gray-600 font-black uppercase tracking-widest ml-1">Wallet {lbl}</label>
                  <input type="text" placeholder="0x..." value={val}
                    onChange={e => setter(e.target.value)}
                    className="w-full bg-polkadot-card border border-polkadot-border rounded-2xl px-5 py-4 text-sm font-mono text-white placeholder-gray-800 outline-none focus:border-polkadot-pink/40 shadow-inner transition-all" />
                </div>
              ))}
            </div>

            <button onClick={handleCompare} disabled={loadingA || loadingB || !inputA.trim() || !inputB.trim()}
              className="w-full bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 text-white font-black uppercase tracking-widest py-5 rounded-2xl transition-all shadow-lg active:scale-[0.98]">
              {loadingA || loadingB ? <div className="flex items-center justify-center gap-2"><Spinner /> PROFILING...</div> : '⚖️ RUN HEAD-TO-HEAD'}
            </button>

            {errorC && <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-5 py-4 text-red-400 text-[10px] font-black uppercase text-center tracking-widest">{errorC}</div>}

            {(resultA || resultB || loadingA || loadingB) && (
              <div className="space-y-10">
                {resultA?.hasScore && resultB?.hasScore && <CompareTable a={resultA} b={resultB} />}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {['A', 'B'].map((lbl, idx) => {
                    const l = idx === 0 ? loadingA : loadingB;
                    const r = idx === 0 ? resultA : resultB;
                    return (
                      <div key={lbl} className="space-y-4">
                        <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest text-center">{l ? '⏳ Profiling...' : `Profile ${lbl}`}</div>
                        {l ? <div className="bg-polkadot-card border border-polkadot-border rounded-3xl p-12 flex justify-center"><Spinner /></div> : r ? <ResultCard result={r} compact showNFT={false} showHistory={false} /> : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
