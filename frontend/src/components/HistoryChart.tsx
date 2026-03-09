import type { HistoryRecord } from '../types/index.js';

interface Props {
  history: HistoryRecord[];
}

function scoreColor(score: number): string {
  if (score >= 750) return '#4ade80';
  if (score >= 500) return '#facc15';
  if (score >= 250) return '#fb923c';
  return '#f87171';
}

export function HistoryChart({ history }: Props) {
  if (!history || history.length === 0) return null;

  const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
  const max    = 1000;
  const W      = 100;
  const H      = 60;
  const pad    = 4;

  const points = sorted.map((r, i) => {
    const x = sorted.length === 1
      ? W / 2
      : pad + (i / (sorted.length - 1)) * (W - pad * 2);
    const y = H - pad - ((r.score / max) * (H - pad * 2));
    return { x, y, record: r };
  });

  const polyline = points.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <div className="bg-polkadot-card border border-polkadot-border rounded-2xl p-5 space-y-3">
      <div className="text-xs text-gray-500 uppercase tracking-widest">Score History</div>

      {/* SVG chart */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-24"
        preserveAspectRatio="none"
      >
        {/* Grid lines */}
        {[0, 250, 500, 750, 1000].map(v => {
          const y = H - pad - ((v / max) * (H - pad * 2));
          return (
            <line
              key={v}
              x1={pad} y1={y} x2={W - pad} y2={y}
              stroke="#222" strokeWidth="0.5"
            />
          );
        })}

        {/* Line */}
        {points.length > 1 && (
          <polyline
            points={polyline}
            fill="none"
            stroke="#E6007A"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Dots */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="2"
            fill={scoreColor(p.record.score)}
          />
        ))}
      </svg>

      {/* History list */}
      <div className="space-y-2">
        {sorted.slice().reverse().map((r) => {
          return (
            <div
              key={r.id}
              className="flex items-center justify-between text-xs py-2 border-b border-polkadot-border last:border-0"
            >
              <div className="space-y-0.5">
                <div
                  className="font-mono font-bold"
                  style={{ color: scoreColor(r.score) }}
                >
                  {r.score}/1000
                </div>
                <div className="text-gray-600">
                  {new Date(r.timestamp).toLocaleString()}
                </div>
              </div>
              <a
                href={`https://polkadot.testnet.routescan.io/tx/${r.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-polkadot-pink hover:text-pink-400 font-mono transition-colors"
              >
                {r.txHash.slice(0, 8)}...↗
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}