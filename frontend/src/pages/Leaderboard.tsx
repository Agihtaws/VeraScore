import { useState, useEffect, useCallback } from 'react';

const EXPLORER = 'https://polkadot.testnet.routescan.io';
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''; // Add this

const CAT_MAX: Record<string, number> = {
  transactionActivity: 200,
  accountAge:          100,
  nativeBalance:       150,
  usdtHolding:         200,
  usdcHolding:         150,
  accountComplexity:   200,
  runtimeModernity:    100,
};
const CAT_LABELS: Record<string, string> = {
  transactionActivity: 'Activity',
  accountAge:          'Age',
  nativeBalance:       'PAS',
  usdtHolding:         'USDT',
  usdcHolding:         'USDC',
  accountComplexity:   'Complex',
  runtimeModernity:    'Runtime',
};
const TOTAL_MAX = Object.values(CAT_MAX).reduce((a, b) => a + b, 0); // 1100

interface LeaderboardEntry {
  rank:      number;
  address:   string;
  score:     number;
  breakdown: string;
  txHash:    string;
  timestamp: number;
}
interface LeaderboardData {
  entries:      LeaderboardEntry[];
  totalWallets: number;
}

function scoreColor(s: number) {
  if (s >= 750) return 'text-emerald-400';
  if (s >= 500) return 'text-yellow-400';
  if (s >= 250) return 'text-orange-400';
  return 'text-red-400';
}
function scoreLabel(s: number) {
  if (s >= 750) return 'Excellent';
  if (s >= 500) return 'Good';
  if (s >= 250) return 'Fair';
  return 'New Wallet';
}
function rankStyle(rank: number) {
  if (rank === 1) return { ring: 'border-yellow-500/40  bg-yellow-500/5',  num: 'text-yellow-400',  icon: '🥇' };
  if (rank === 2) return { ring: 'border-gray-400/30    bg-white/[0.02]',  num: 'text-gray-300',    icon: '🥈' };
  if (rank === 3) return { ring: 'border-orange-600/40  bg-orange-500/5',  num: 'text-orange-400',  icon: '🥉' };
  return               { ring: 'border-polkadot-border bg-polkadot-card', num: 'text-gray-600',    icon: ''   };
}
function fmtAddr(addr: string) { return `${addr.slice(0, 8)}…${addr.slice(-5)}`; }
function fmtDate(ts: number)   {
  return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function BreakdownBars({ breakdown }: { breakdown: Record<string, number> }) {
  return (
    <div className="grid grid-cols-7 gap-1 pt-3">
      {Object.entries(CAT_MAX).map(([key, max]) => {
        const val = breakdown[key] ?? 0;
        const pct = Math.round((val / max) * 100);
        return (
          <div key={key} className="flex flex-col items-center gap-1">
            <div className="w-full h-10 bg-polkadot-dark rounded relative overflow-hidden flex items-end">
              <div className="w-full bg-polkadot-pink/60 rounded transition-all duration-700"
                style={{ height: `${pct}%`, minHeight: pct > 0 ? '2px' : '0' }} />
            </div>
            <div className="text-[7px] text-gray-600 text-center leading-tight">{CAT_LABELS[key]}</div>
            <div className="text-[8px] font-mono text-gray-600">{val}</div>
          </div>
        );
      })}
    </div>
  );
}

function LeaderRow({ entry, expanded, onToggle }: {
  entry: LeaderboardEntry; expanded: boolean; onToggle: () => void;
}) {
  const { ring, num, icon } = rankStyle(entry.rank);
  const pct = Math.round((entry.score / TOTAL_MAX) * 100);
  let breakdown: Record<string, number> = {};
  try { breakdown = JSON.parse(entry.breakdown); } catch { /* ignore */ }

  return (
    <div className={`border rounded-2xl overflow-hidden transition-all ${ring}`}>
      <button onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">

        {/* Rank */}
        <div className={`w-7 shrink-0 text-center font-black text-sm ${num}`}>
          {icon || `#${entry.rank}`}
        </div>

        {/* Address + date */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs text-white">{fmtAddr(entry.address)}</span>
            <a href={`${EXPLORER}/address/${entry.address}`} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-gray-700 hover:text-polkadot-pink transition-colors text-[10px]">↗</a>
          </div>
          <div className="text-[9px] text-gray-600 mt-0.5">{fmtDate(entry.timestamp)}</div>
        </div>

        {/* Mini bar */}
        <div className="hidden sm:block w-24 space-y-1">
          <div className="h-1 bg-black/40 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-polkadot-pink transition-all duration-700"
              style={{ width: `${pct}%` }} />
          </div>
          <div className={`text-[8px] font-bold ${scoreColor(entry.score)}`}>
            {scoreLabel(entry.score)}
          </div>
        </div>

        {/* Score */}
        <div className="text-right shrink-0">
          <div className={`text-xl font-black font-mono ${entry.rank <= 3 ? num : 'text-white'}`}>
            {entry.score}
          </div>
          <div className="text-[8px] text-gray-700">/{TOTAL_MAX}</div>
        </div>

        {/* Chevron */}
        <svg className={`w-3.5 h-3.5 text-gray-600 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-white/5">
          <BreakdownBars breakdown={breakdown} />
          <div className="mt-2.5 flex items-center justify-between">
            <span className="text-[8px] font-bold uppercase tracking-widest text-gray-700">Mint Tx</span>
            <a href={`${EXPLORER}/tx/${entry.txHash}`} target="_blank" rel="noopener noreferrer"
              className="text-[9px] font-mono text-gray-600 hover:text-polkadot-pink transition-colors">
              {entry.txHash.slice(0, 12)}…{entry.txHash.slice(-5)} ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export function Leaderboard() {
  const [data,      setData]      = useState<LeaderboardData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [expanded,  setExpanded]  = useState<number | null>(null);
  const [lastFetch, setLastFetch] = useState<number>(0);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const res  = await fetch(`${API_BASE}/score/leaderboard`); // Updated
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const json = await res.json() as { success: boolean; entries: LeaderboardEntry[]; totalWallets: number };
      if (!json.success) throw new Error('Failed to load leaderboard');
      setData(json); setLastFetch(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const id = setInterval(load, 30_000); return () => clearInterval(id); }, [load]);

  const toggle = (rank: number) => setExpanded(prev => prev === rank ? null : rank);

  if (loading && !data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-polkadot-pink border-t-transparent rounded-full animate-spin" />
        <div className="text-gray-600 text-xs">Loading leaderboard…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-3">
        <div className="text-3xl">⚠</div>
        <div className="text-red-400 text-xs">{error}</div>
        <button onClick={load}
          className="bg-polkadot-pink hover:bg-pink-600 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors">
          Retry
        </button>
      </div>
    );
  }

  const entries = data?.entries ?? [];

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4">

      {/* Header */}
      <div>
        <h1 className="text-xl font-black tracking-tight text-white">
          Score <span className="text-polkadot-pink">Leaderboard</span>
        </h1>
        <p className="text-[10px] text-gray-600 mt-0.5 font-medium">
          Top wallets on PAS TestNet · Auto-refreshes every 30s
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Wallets',     value: (data?.totalWallets ?? 0).toString() },
          { label: 'Top Score',   value: entries[0] ? `${entries[0].score}` : '—' },
          { label: 'Max Possible',value: TOTAL_MAX.toString() },
        ].map(({ label, value }) => (
          <div key={label} className="bg-polkadot-card border border-polkadot-border rounded-xl px-3 py-2.5 text-center">
            <div className="text-sm font-black font-mono text-white">{value}</div>
            <div className="text-[8px] font-bold uppercase tracking-widest text-gray-700 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Score distribution bar chart */}
      {entries.length > 0 && (
        <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-polkadot-border bg-black/20 flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Distribution</span>
            <span className="text-[9px] font-mono text-gray-700">{entries.length} wallets</span>
          </div>
          <div className="px-4 py-3 flex items-end gap-1.5 h-16">
            {entries.map(e => {
              const h = Math.max(4, Math.round((e.score / TOTAL_MAX) * 48));
              return (
                <div key={e.rank} title={`#${e.rank}: ${e.score}`}
                  className="flex-1 flex flex-col justify-end items-center gap-0.5">
                  <div className={`w-full rounded-t ${
                    e.rank === 1 ? 'bg-yellow-500/70' :
                    e.rank === 2 ? 'bg-gray-400/50'   :
                    e.rank === 3 ? 'bg-orange-500/60' : 'bg-polkadot-pink/40'
                  }`} style={{ height: `${h}px` }} />
                  <span className={`text-[7px] font-mono ${scoreColor(e.score)}`}>{e.score}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Entries */}
      {entries.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <div className="text-4xl">🏆</div>
          <div className="text-white text-sm font-semibold">No scores yet</div>
          <div className="text-gray-600 text-xs">Be the first to mint a VeraScore NFT!</div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="text-[8px] font-bold uppercase tracking-widest text-gray-700 px-1">
            Tap any row for breakdown
          </div>
          {entries.map(entry => (
            <LeaderRow key={entry.rank} entry={entry}
              expanded={expanded === entry.rank} onToggle={() => toggle(entry.rank)} />
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-[9px] text-gray-700">
        {lastFetch > 0 && <span>Updated {new Date(lastFetch).toLocaleTimeString()}</span>}
        <button onClick={load}
          className="hover:text-gray-400 transition-colors underline underline-offset-2">
          Refresh now
        </button>
      </div>
    </div>
  );
}