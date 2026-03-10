import type { HistoryRecord } from '../types'; // Removed .js pa!

interface Props {
  history: HistoryRecord[];
}

// Matching your app's color palette pa!
function scoreColor(score: number): string {
  if (score >= 750) return '#34d399'; // Emerald 400 (Excellent)
  if (score >= 500) return '#fbbf24'; // Amber 400 (Good)
  if (score >= 250) return '#fb923c'; // Orange 400 (Fair)
  return '#f87171'; // Red 400 (Poor)
}

export function HistoryChart({ history }: Props) {
  if (!history || history.length === 0) return null;

  // 1. Sort by time and set the max scale to 1100 (matching your Mistral AI scale!)
  const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
  const max    = 1100; 
  const W      = 100;
  const H      = 60;
  const pad    = 6;

  const points = sorted.map((r, i) => {
    const x = sorted.length === 1
      ? W / 2
      : pad + (i / (sorted.length - 1)) * (W - pad * 2);
    const y = H - pad - ((r.score / max) * (H - pad * 2));
    return { x, y, record: r };
  });

  const polyline = points.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <div className="bg-polkadot-card border border-polkadot-border rounded-2xl p-6 space-y-4 shadow-xl">
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500 uppercase tracking-widest font-bold">Growth History</div>
        <div className="text-[10px] text-gray-600 font-mono">Scale: 0–1100</div>
      </div>

      {/* SVG Chart Area */}
      <div className="relative group">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-32 overflow-visible"
          preserveAspectRatio="none"
        >
          {/* Subtle Grid lines */}
          {[0, 250, 500, 750, 1100].map(v => {
            const y = H - pad - ((v / max) * (H - pad * 2));
            return (
              <line
                key={v}
                x1={pad} y1={y} x2={W - pad} y2={y}
                stroke="#1f2937" strokeWidth="0.5"
                strokeDasharray="2,2"
              />
            );
          })}

          {/* The Score Line */}
          {points.length > 1 && (
            <polyline
              points={polyline}
              fill="none"
              stroke="#E6007A"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              className="drop-shadow-[0_0_8px_rgba(230,0,122,0.4)]"
            />
          )}

          {/* Interactive Dots */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="2.5"
              fill={scoreColor(p.record.score)}
              className="stroke-polkadot-dark stroke-[1px] transition-all hover:r-4"
            />
          ))}
        </svg>
      </div>

      {/* History List */}
      <div className="space-y-3 max-h-60 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-800">
        {sorted.slice().reverse().map((r) => {
          return (
            <div
              key={r.id}
              className="flex items-center justify-between p-3 rounded-xl bg-polkadot-dark/40 border border-polkadot-border/50 hover:border-polkadot-pink/30 transition-all"
            >
              <div className="space-y-1">
                <div
                  className="font-mono font-bold text-sm"
                  style={{ color: scoreColor(r.score) }}
                >
                  {r.score} <span className="text-[10px] opacity-50 text-gray-400">/ 1100</span>
                </div>
                <div className="text-[10px] text-gray-500 font-medium">
                  {new Date(r.timestamp).toLocaleDateString('en-GB', { 
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
                  })}
                </div>
              </div>
              <a
                href={`https://polkadot.testnet.routescan.io/tx/${r.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-polkadot-pink/10 hover:bg-polkadot-pink/20 text-polkadot-pink px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-colors flex items-center gap-1"
              >
                {r.txHash.slice(0, 6)}... ↗
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
