import { useState, useEffect, useCallback } from 'react';

const EXPLORER = 'https://polkadot.testnet.routescan.io';

// Max scores per category — must match contract
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
  transactionActivity: 'Tx Activity',
  accountAge:          'Account Age',
  nativeBalance:       'PAS Balance',
  usdtHolding:         'USDT',
  usdcHolding:         'USDC',
  accountComplexity:   'Complexity',
  runtimeModernity:    'Modernity',
};
const TOTAL_MAX = Object.values(CAT_MAX).reduce((a, b) => a + b, 0); // 1100

interface LeaderboardEntry {
  rank:      number;
  address:   string;
  score:     number;
  breakdown: string; // JSON
  txHash:    string;
  timestamp: number;
}

interface LeaderboardData {
  entries:      LeaderboardEntry[];
  totalWallets: number;
}

function scoreLabel(score: number): { label: string; color: string } {
  if (score >= 800) return { label: 'Excellent', color: 'text-emerald-400' };
  if (score >= 600) return { label: 'Good',      color: 'text-green-400'   };
  if (score >= 400) return { label: 'Fair',       color: 'text-yellow-400'  };
  if (score >= 200) return { label: 'Poor',       color: 'text-orange-400'  };
  return               { label: 'Very Poor',  color: 'text-red-400'     };
}

function rankBadge(rank: number) {
  if (rank === 1) return { bg: 'bg-yellow-500/20 border-yellow-500/40', text: 'text-yellow-400', icon: '🥇' };
  if (rank === 2) return { bg: 'bg-gray-400/10  border-gray-400/30',   text: 'text-gray-300',   icon: '🥈' };
  if (rank === 3) return { bg: 'bg-orange-700/20 border-orange-600/40', text: 'text-orange-400', icon: '🥉' };
  return               { bg: 'bg-polkadot-card   border-polkadot-border', text: 'text-gray-500', icon: '' };
}

function fmtAddr(addr: string) {
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Mini breakdown bar chart ──────────────────────────────────────────────────
function BreakdownBars({ breakdown }: { breakdown: Record<string, number> }) {
  return (
    <div className="grid grid-cols-7 gap-1 mt-3">
      {Object.entries(CAT_MAX).map(([key, max]) => {
        const val  = breakdown[key] ?? 0;
        const pct  = Math.round((val / max) * 100);
        return (
          <div key={key} className="flex flex-col items-center gap-1">
            <div className="w-full h-16 bg-polkadot-dark rounded-sm relative overflow-hidden flex items-end">
              <div
                className="w-full rounded-sm bg-polkadot-pink/70 transition-all duration-700"
                style={{ height: `${pct}%`, minHeight: pct > 0 ? '2px' : '0' }}
              />
            </div>
            <div className="text-[8px] text-gray-600 text-center leading-tight">{CAT_LABELS[key]}</div>
            <div className="text-[9px] font-mono text-gray-500">{val}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Single leaderboard row ────────────────────────────────────────────────────
function LeaderRow({ entry, expanded, onToggle }: {
  entry:    LeaderboardEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { label, color } = scoreLabel(entry.score);
  const badge            = rankBadge(entry.rank);
  const pct              = Math.round((entry.score / TOTAL_MAX) * 100);

  let breakdown: Record<string, number> = {};
  try { breakdown = JSON.parse(entry.breakdown); } catch { /* ignore */ }

  return (
    <div className={`border rounded-2xl overflow-hidden transition-colors ${badge.bg}`}>
      {/* Main row */}
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors"
      >
        {/* Rank */}
        <div className={`w-8 shrink-0 text-center font-bold text-lg ${badge.text}`}>
          {badge.icon || `#${entry.rank}`}
        </div>

        {/* Address + date */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-white">{fmtAddr(entry.address)}</span>
            <a
              href={`${EXPLORER}/address/${entry.address}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-gray-600 hover:text-polkadot-pink transition-colors text-xs"
            >
              ↗
            </a>
          </div>
          <div className="text-[11px] text-gray-600 mt-0.5">{fmtDate(entry.timestamp)}</div>
        </div>

        {/* Score bar */}
        <div className="hidden sm:flex flex-col gap-1 w-32">
          <div className="w-full h-1.5 bg-polkadot-dark rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-polkadot-pink transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className={`font-medium ${color}`}>{label}</span>
            <span className="text-gray-600 font-mono">{pct}%</span>
          </div>
        </div>

        {/* Score number */}
        <div className="text-right shrink-0">
          <div className={`text-2xl font-bold font-mono ${entry.rank <= 3 ? badge.text : 'text-white'}`}>
            {entry.score}
          </div>
          <div className="text-[10px] text-gray-600">/ {TOTAL_MAX}</div>
        </div>

        {/* Expand chevron */}
        <div className={`text-gray-600 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded breakdown */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-white/5">
          <BreakdownBars breakdown={breakdown} />
          <div className="mt-3 flex items-center justify-between text-[11px]">
            <span className="text-gray-600">Mint tx</span>
            <a
              href={`${EXPLORER}/tx/${entry.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-gray-500 hover:text-polkadot-pink transition-colors"
            >
              {entry.txHash.slice(0, 12)}…{entry.txHash.slice(-6)} ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function Leaderboard() {
  const [data,     setData]     = useState<LeaderboardData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [lastFetch, setLastFetch] = useState<number>(0);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/score/leaderboard');
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const json = await res.json() as { success: boolean; entries: LeaderboardEntry[]; totalWallets: number };
      if (!json.success) throw new Error('Failed to load leaderboard');
      setData(json);
      setLastFetch(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const toggle = (rank: number) =>
    setExpanded(prev => prev === rank ? null : rank);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-10 h-10 border-2 border-polkadot-pink border-t-transparent rounded-full animate-spin mx-auto" />
        <div className="text-gray-500 text-sm">Loading leaderboard…</div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="text-4xl">⚠</div>
        <div className="text-red-400 text-sm">{error}</div>
        <button
          onClick={load}
          className="bg-polkadot-pink hover:bg-pink-600 text-white px-5 py-2 rounded-xl text-sm transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const entries = data?.entries ?? [];

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-6">

      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">
          Score <span className="text-polkadot-pink">Leaderboard</span>
        </h1>
        <p className="text-gray-500 text-sm">
          Top wallets ranked by highest VeraScore on PAS TestNet
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Wallets Scored',  value: (data?.totalWallets ?? 0).toString(),        icon: '🏅' },
          { label: 'Top Score',       value: entries[0] ? `${entries[0].score}` : '—',    icon: '🥇' },
          { label: 'Max Possible',    value: TOTAL_MAX.toString(),                         icon: '⭐' },
        ].map(({ label, value, icon }) => (
          <div key={label} className="bg-polkadot-card border border-polkadot-border rounded-xl py-4 px-3 text-center space-y-1">
            <div className="text-2xl">{icon}</div>
            <div className="font-mono font-bold text-white text-lg">{value}</div>
            <div className="text-gray-600 text-[10px] uppercase tracking-wider">{label}</div>
          </div>
        ))}
      </div>

      {/* Score distribution mini chart */}
      {entries.length > 0 && (
        <div className="bg-polkadot-card border border-polkadot-border rounded-2xl p-4 space-y-3">
          <div className="text-xs text-gray-500 uppercase tracking-widest">Score Distribution</div>
          <div className="flex items-end gap-1.5 h-12">
            {entries.map(e => {
              const h = Math.max(4, Math.round((e.score / TOTAL_MAX) * 48));
              const { color } = scoreLabel(e.score);
              return (
                <div key={e.rank} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={`w-full rounded-t-sm ${
                      e.rank === 1 ? 'bg-yellow-500/70' :
                      e.rank === 2 ? 'bg-gray-400/50'   :
                      e.rank === 3 ? 'bg-orange-500/60' : 'bg-polkadot-pink/40'
                    }`}
                    style={{ height: `${h}px` }}
                  />
                  <div className={`text-[8px] font-mono ${color}`}>{e.score}</div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[9px] text-gray-700">
            <span>#1 highest</span>
            <span>#{entries.length} on board</span>
          </div>
        </div>
      )}

      {/* Leaderboard entries */}
      {entries.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="text-5xl">🏆</div>
          <div className="text-white font-semibold">No scores yet</div>
          <div className="text-gray-500 text-sm">Be the first to mint a VeraScore NFT!</div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-gray-600 px-1">
            Top {entries.length} wallets · Click any row to see breakdown
          </div>
          {entries.map(entry => (
            <LeaderRow
              key={entry.rank}
              entry={entry}
              expanded={expanded === entry.rank}
              onToggle={() => toggle(entry.rank)}
            />
          ))}
        </div>
      )}

      {/* Refresh info */}
      <div className="text-center text-[11px] text-gray-700 space-x-2">
        <span>Auto-refreshes every 30s</span>
        {lastFetch > 0 && (
          <span>· Last updated {new Date(lastFetch).toLocaleTimeString()}</span>
        )}
        <button onClick={load} className="text-gray-600 hover:text-gray-400 transition-colors underline underline-offset-2">
          Refresh now
        </button>
      </div>
    </div>
  );
}