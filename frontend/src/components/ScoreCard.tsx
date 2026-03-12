import { useBalance }                              from 'wagmi';
import { pasTestnet, USDT_ERC20, USDC_ERC20,
         STABLECOIN_DECIMALS }                     from '../utils/wagmi';
import type { ScorePayload }                       from '../hooks/useScore';

interface Props { payload: ScorePayload; expiresAt?: number; }

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

const PAS_UNITS = 10n ** 18n;
function formatPAS(wei: string): string {
  try { const v = BigInt(wei); return `${(v / PAS_UNITS).toString()} PAS`; }
  catch { return '0 PAS'; }
}
function fmt(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Bar({ label, value, max, score }: { label: string; value: number; max: number; score: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600">{label}</span>
        <span className="text-[9px] font-mono text-gray-500">
          {value}<span className="text-gray-700">/{max}</span>
        </span>
      </div>
      <div className="h-1 bg-black/40 rounded-full overflow-hidden border border-white/5">
        <div className={`h-full rounded-full transition-all duration-700 ${scoreBg(score)}`}
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ScoreCard({ payload, expiresAt }: Props) {
  const { score, reasoning, breakdown, rawChainData } = payload;
  const expiry  = expiresAt ?? Math.floor(rawChainData.queriedAt / 1000) + 2 * 3600;
  const isValid = Math.floor(Date.now() / 1000) <= expiry;

  const { data: liveBalance } = useBalance({
    address: rawChainData.address as `0x${string}`, chainId: pasTestnet.id,
    query: { refetchInterval: 10_000, staleTime: 10_000 },
  });
  const { data: liveUSDT } = useBalance({
    address: rawChainData.address as `0x${string}`, token: USDT_ERC20, chainId: pasTestnet.id,
    query: { refetchInterval: 10_000, staleTime: 10_000 },
  });
  const { data: liveUSDC } = useBalance({
    address: rawChainData.address as `0x${string}`, token: USDC_ERC20, chainId: pasTestnet.id,
    query: { refetchInterval: false, staleTime: Infinity },
  });

  function formatStable(value: bigint, symbol: string): string {
    const units = 10n ** BigInt(STABLECOIN_DECIMALS);
    const whole  = value / units;
    const frac   = value % units;
    const fracStr = frac.toString().padStart(STABLECOIN_DECIMALS, '0').replace(/0+$/, '');
    return fracStr.length > 0 ? `${whole.toLocaleString()}.${fracStr} ${symbol}` : `${whole.toLocaleString()} ${symbol}`;
  }
  function formatStableRaw(raw: string, symbol: string): string {
    try { const v = BigInt(raw); return v === 0n ? '—' : formatStable(v, symbol); }
    catch { return raw; }
  }

  const usdtDisplay = liveUSDT ? (liveUSDT.value === 0n ? '—' : formatStable(liveUSDT.value, 'USDT')) : formatStableRaw(rawChainData.usdtBalance, 'USDT');
  const usdcDisplay = liveUSDC ? (liveUSDC.value === 0n ? '—' : formatStable(liveUSDC.value, 'USDC')) : formatStableRaw(rawChainData.usdcBalance, 'USDC');
  const pasDisplay  = liveBalance
    ? `${Number(liveBalance.value) / 1e18 < 0.001 ? '<0.001' : (Number(liveBalance.value) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 })} PAS`
    : formatPAS(rawChainData.freeBalance);

  const pasDotClass  = liveBalance && liveBalance.value > 0n ? 'bg-emerald-500 animate-pulse' : 'bg-gray-700';
  const usdtDotClass = liveUSDT   && liveUSDT.value   > 0n  ? 'bg-emerald-500 animate-pulse' : 'bg-gray-700';
  const usdcDotClass = liveUSDC   && liveUSDC.value   > 0n  ? 'bg-emerald-500 animate-pulse' : 'bg-gray-700';

  return (
    <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden shadow-xl">

      {/* ── Score hero ─────────────────────────────────────────────── */}
      <div className="px-5 pt-6 pb-5 border-b border-polkadot-border text-center space-y-3 bg-gradient-to-b from-white/[0.03] to-transparent">
        <div className={`text-6xl font-black font-mono tracking-tight leading-none ${scoreColor(score)}`}>
          {score}
        </div>
        <div className="text-[8px] font-bold text-gray-700 uppercase tracking-widest">Credit Score / 1100</div>

        <div className="max-w-48 mx-auto">
          <div className="h-1 bg-black/40 rounded-full overflow-hidden border border-white/5">
            <div className={`h-full rounded-full transition-all duration-700 ${scoreBg(score)}`}
              style={{ width: `${(score / 1100) * 100}%` }} />
          </div>
        </div>

        <div className="flex items-center justify-center gap-1.5">
          <span className={`text-[8px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-wide ${
            score >= 750 ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5' :
            score >= 500 ? 'border-amber-500/30   text-amber-400   bg-amber-500/5'   :
                           'border-orange-500/30  text-orange-400  bg-orange-500/5'}`}>
            {scoreLabel(score)}
          </span>
          <span className={`text-[8px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-wide ${
            isValid ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5'
                    : 'border-red-500/30     text-red-400     bg-red-500/5'}`}>
            {isValid ? '✦ Valid' : 'Expired'}
          </span>
        </div>

        <div className="text-[9px] text-gray-700">
          {isValid ? `Refresh after ${fmt(expiry)}` : `Expired ${fmt(expiry)}`}
        </div>
      </div>

      {/* ── AI Reasoning ───────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-polkadot-border bg-black/10">
        <div className="text-[8px] font-black uppercase tracking-widest text-gray-700 mb-2">Mistral AI Analysis</div>
        <p className="text-gray-400 text-xs leading-relaxed italic">"{reasoning}"</p>
      </div>

      {/* ── Score breakdown ────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-polkadot-border space-y-3">
        <div className="text-[8px] font-black uppercase tracking-widest text-gray-700">Risk Parameters</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          <div className="space-y-3">
            <Bar label="Activity"     value={breakdown.transactionActivity} max={200} score={score} />
            <Bar label="Wallet Age"   value={breakdown.accountAge}          max={100} score={score} />
            <Bar label="PAS Balance"  value={breakdown.nativeBalance}       max={150} score={score} />
          </div>
          <div className="space-y-3">
            <Bar label="USDT Volume"  value={breakdown.usdtHolding}         max={200} score={score} />
            <Bar label="USDC Volume"  value={breakdown.usdcHolding}         max={150} score={score} />
            <Bar label="Complexity"   value={breakdown.accountComplexity}   max={200} score={score} />
          </div>
        </div>
      </div>

      {/* ── On-chain evidence ──────────────────────────────────────── */}
      <div className="px-5 py-4 bg-black/10">
        <div className="text-[8px] font-black uppercase tracking-widest text-gray-700 mb-3">On-Chain Evidence</div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'PAS Balance', dot: pasDotClass,  value: pasDisplay  },
            { label: 'USDT',        dot: usdtDotClass, value: usdtDisplay },
            { label: 'USDC',        dot: usdcDotClass, value: usdcDisplay },
            { label: 'Nonce',       dot: 'bg-gray-700', value: `#${rawChainData.nonce}` },
          ].map(({ label, dot, value }) => (
            <div key={label} className="bg-polkadot-dark/60 border border-white/5 rounded-xl px-3 py-2.5">
              <div className="text-[8px] font-bold uppercase tracking-widest text-gray-700 mb-1">{label}</div>
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                <span className="text-[10px] font-mono text-gray-400 truncate">{value}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}