import { useState, useEffect, useCallback } from 'react';

const EXPLORER = 'https://polkadot.testnet.routescan.io';

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
  accountComplexity:   'Complexity',
  runtimeModernity:    'Modernity',
};

const TOTAL_MAX = 1100; // Matching your Mistral AI scale pa!

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

function scoreColor(score: number): string {
  if (score >= 800) return 'text-emerald-400';
  if (score >= 600) return 'text-green-400';
  if (score >= 400) return 'text-amber-400';
  if (score >= 200) return 'text-orange-400';
  return 'text-red-400';
}

function rankBadge(rank: number) {
  if (rank === 1) return { bg: 'bg-yellow-500/10 border-yellow-500/30', text: 'text-yellow-400', icon: '🥇' };
  if (rank === 2) return { bg: 'bg-slate-400/10 border-slate-400/30',   text: 'text-slate-300',  icon: '🥈' };
  if (rank === 3) return { bg: 'bg-orange-700/10 border-orange-600/30', text: 'text-orange-400', icon: '🥉' };
  return { bg: 'bg-polkadot-card border-polkadot-border', text: 'text-gray-500', icon: '' };
}

// ── Mini breakdown bars ──
function BreakdownBars({ breakdown }: { breakdown: Record<string, number> }) {
  return (
    <div className="grid grid-cols-7 gap-2 mt-4 bg-black/20 p-4 rounded-xl border border-white/5">
      {Object.entries(CAT_MAX).map(([key, max]) => {
        const val = breakdown[key] ?? 0;
        const pct = Math.round((val / max) * 100);
        return (
          <div key={key} className="flex flex-col items-center gap-1.5">
            <div className="w-full h-16 bg-polkadot-dark rounded-sm relative overflow-hidden flex items-end border border-white/5">
              <div
                className="w-full bg-polkadot-pink/60 transition-all duration-1000 ease-out"
                style={{ height: `${pct}%` }}
              />
            </div>
            <div className="text-[7px] text-gray-500 font-black uppercase tracking-tighter text-center leading-none">{CAT_LABELS[key]}</div>
            <div className="text-[9px] font-mono font-bold text-gray-400">{val}</div>
          </div>
        );
      })}
    </div>
  );
}

function LeaderRow({ entry, expanded, onToggle }: { entry: LeaderboardEntry; expanded: boolean; onToggle: () => void; }) {
  const colorClass = scoreColor(entry.score);
  const badge      = rankBadge(entry.rank);
  const pct        = Math.round((entry.score / TOTAL_MAX) * 100);

  let breakdown: Record<string, number> = {};
  try { breakdown = JSON.parse(entry.breakdown); } catch { /**/ }

  return (
    <div className={`border rounded-2xl overflow-hidden transition-all duration-300 ${expanded ? 'ring-1 ring-polkadot-pink/30 shadow-lg' : ''} ${badge.bg}`}>
      <button onClick={onToggle} className="w-full text-left px-5 py-5 flex items-center gap-4 hover:bg-white/[0.03] transition-colors">
        <div className={`w-8 shrink-0 text-center font-black text-xl ${badge.text}`}>
          {badge.icon || `#${entry.rank}`}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-white">{entry.address.slice(0, 10)}...{entry.address.slice(-6)}</span>
          </div>
          <div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mt-1">
            {new Date(entry.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
          </div>
        </div>

        <div className="hidden md:block w-32 space-y-1">
          <div className="h-1 bg-black/40 rounded-full overflow-hidden">
            <div className="h-full bg-polkadot-pink rounded-full transition-all duration-1000" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-[8px] font-black uppercase text-gray-500 tracking-tighter">
            <span>Power</span>
            <span>{pct}%</span>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className={`text-2xl font-black font-mono tracking-tighter ${colorClass}`}>
            {entry.score}
          </div>
          <div className="text-[9px] font-bold text-gray-700 uppercase">/ {TOTAL_MAX}</div>
        </div>

        <div className={`text-gray-700 transition-transform ${expanded ? 'rotate-180' : ''}`}>
          ▼
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-white/5 bg-black/10">
          <BreakdownBars breakdown={breakdown} />
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Mint Evidence</span>
            <a
              href={`${EXPLORER}/tx/${entry.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-mono text-polkadot-pink hover:underline"
            >
              {entry.txHash.slice(0, 20)}... ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export function Leaderboard() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/score/leaderboard');
      const json = await res.json();
      if (!json.success) throw new Error('Failed to fetch');
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  if (loading && !data) return (
    <div className="py-20 text-center space-y-4">
      <div className="w-10 h-10 border-2 border-polkadot-pink border-t-transparent rounded-full animate-spin mx-auto" />
      <div className="text-gray-500 text-xs font-black uppercase tracking-widest">Compiling Rankings...</div>
    </div>
  );

  const entries = data?.entries ?? [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-10">
      
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-black tracking-tighter uppercase italic text-white">
          Network <span className="text-polkadot-pink">Leaderboard</span>
        </h1>
        <p className="text-gray-500 text-xs font-black uppercase tracking-[0.3em]">Top Credit Profiles · Paseo Asset Hub</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Wallets', value: data?.totalWallets ?? 0, icon: '🌐' },
          { label: 'Top Score', value: entries[0]?.score ?? 0, icon: '🔥' },
          { label: 'Max Cap', value: TOTAL_MAX, icon: '💎' },
        ].map(s => (
          <div key={s.label} className="bg-polkadot-card border border-polkadot-border rounded-2xl p-5 text-center shadow-xl">
            <div className="text-xl mb-1">{s.icon}</div>
            <div className="text-xl font-black font-mono text-white">{s.value}</div>
            <div className="text-[9px] font-black text-gray-600 uppercase tracking-widest">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Distribution Chart */}
      {entries.length > 0 && (
        <div className="bg-polkadot-card border border-polkadot-border rounded-3xl p-6 space-y-4 shadow-2xl">
          <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Score Density</div>
          <div className="flex items-end gap-1 h-16 px-2">
            {entries.map(e => (
              <div
                key={e.rank}
                className={`flex-1 rounded-t-sm transition-all duration-1000 ${
                  e.rank <= 3 ? 'bg-polkadot-pink' : 'bg-white/10'
                }`}
                style={{ height: `${(e.score / TOTAL_MAX) * 100}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between text-[8px] font-black text-gray-700 uppercase tracking-tighter">
            <span>Rank #1</span>
            <span>Rank #{entries.length}</span>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Verified Participants</span>
          <button onClick={load} className="text-[10px] font-black text-polkadot-pink uppercase hover:opacity-70 transition-opacity">Refresh</button>
        </div>
        
        {entries.length === 0 ? (
          <div className="py-20 text-center bg-polkadot-card border border-polkadot-border rounded-3xl opacity-50">
            <div className="text-gray-500 font-black uppercase tracking-widest">No Records Found</div>
          </div>
        ) : (
          entries.map(entry => (
            <LeaderRow
              key={entry.rank}
              entry={entry}
              expanded={expanded === entry.rank}
              onToggle={() => setExpanded(expanded === entry.rank ? null : entry.rank)}
            />
          ))
        )}
      </div>

      <div className="text-center text-[9px] font-bold text-gray-700 uppercase tracking-widest">
        Live Data Stream · Polkadot SDK · Updated {new Date().toLocaleTimeString()}
      </div>
    </div>
  );
}
