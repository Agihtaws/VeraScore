import { useBalance }                              from 'wagmi';
import { pasTestnet, USDT_ERC20, USDC_ERC20,
         STABLECOIN_DECIMALS }                     from '../utils/wagmi';
import type { ScorePayload }                       from '../hooks/useScore';

interface Props {
  payload:   ScorePayload;
  expiresAt?: number;
}

function scoreColor(score: number) {
  if (score >= 750) return 'text-emerald-400';
  if (score >= 500) return 'text-amber-400';
  if (score >= 250) return 'text-orange-400';
  return 'text-red-400';
}

function scoreBg(score: number) {
  if (score >= 750) return 'bg-emerald-400';
  if (score >= 500) return 'bg-amber-400';
  if (score >= 250) return 'bg-orange-400';
  return 'bg-red-400';
}

function scoreLabel(score: number) {
  if (score >= 750) return 'Excellent';
  if (score >= 500) return 'Good';
  if (score >= 250) return 'Fair';
  return 'New Wallet';
}

const PAS_UNITS = 10n ** 18n;

function formatPAS(wei: string): string {
  try {
    const v = BigInt(wei);
    return `${(v / PAS_UNITS).toString()} PAS`;
  } catch { return '0 PAS'; }
}

function fmt(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

interface BarProps {
  label: string;
  value: number;
  max:   number;
  score: number;
}

function Bar({ label, value, max, score }: BarProps) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px] uppercase tracking-wider">
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-300 font-mono">
          {value}<span className="text-gray-700">/{max}</span>
        </span>
      </div>
      <div className="h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-out ${scoreBg(score)} shadow-[0_0_8px_rgba(52,211,153,0.3)]`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function ScoreCard({ payload, expiresAt }: Props) {
  const { score, reasoning, breakdown, rawChainData, alreadyHadScore } = payload;

  const expiry  = expiresAt ?? Math.floor(rawChainData.queriedAt / 1000) + 2 * 3600;
  const isValid = Math.floor(Date.now() / 1000) <= expiry;

  // Live PAS balance polling every 10s
  const {
    data:      liveBalance,
    isLoading: pasLoading,
  } = useBalance({
    address:  rawChainData.address as `0x${string}`,
    chainId:  pasTestnet.id,
    query: {
      refetchInterval: 10_000,
      staleTime:       10_000,
    },
  });

  // Live USDT balance via ERC-20 precompile
  const {
    data:      liveUSDT,
    isLoading: usdtLoading,
  } = useBalance({
    address:  rawChainData.address as `0x${string}`,
    token:    USDT_ERC20,
    chainId:  pasTestnet.id,
    query: {
      refetchInterval: 10_000,
      staleTime:       10_000,
    },
  });

  // Live USDC balance (Fallback to 0 if not deployed)
  const {
    data:      liveUSDC,
    isLoading: usdcLoading,
  } = useBalance({
    address:  rawChainData.address as `0x${string}`,
    token:    USDC_ERC20,
    chainId:  pasTestnet.id,
    query: {
      refetchInterval: false,
      staleTime:       Infinity,
    },
  });

  function formatStable(value: bigint, symbol: string): string {
    const units = 10n ** BigInt(STABLECOIN_DECIMALS);
    const whole  = value / units;
    const frac   = value % units;
    const fracStr = frac.toString().padStart(STABLECOIN_DECIMALS, '0').replace(/0+$/, '');
    return fracStr.length > 0
      ? `${whole.toLocaleString()}.${fracStr} ${symbol}`
      : `${whole.toLocaleString()} ${symbol}`;
  }

  function formatStableRaw(raw: string, symbol: string): string {
    try {
      const v = BigInt(raw);
      if (v === 0n) return '—';
      return formatStable(v, symbol);
    } catch { return raw; }
  }

  const usdtDisplay = liveUSDT
    ? (liveUSDT.value === 0n ? '—' : formatStable(liveUSDT.value, 'USDT'))
    : formatStableRaw(rawChainData.usdtBalance, 'USDT');

  const usdcDisplay = liveUSDC
    ? (liveUSDC.value === 0n ? '—' : formatStable(liveUSDC.value, 'USDC'))
    : formatStableRaw(rawChainData.usdcBalance, 'USDC');

  const pasDisplay = liveBalance
    ? `${Number(liveBalance.value) / 1e18 < 0.001
        ? '<0.001'
        : (Number(liveBalance.value) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 })
      } PAS`
    : formatPAS(rawChainData.freeBalance);

  const pasDotClass  = liveBalance && liveBalance.value > 0n ? 'bg-emerald-500 animate-pulse' : 'bg-gray-800';
  const usdtDotClass = liveUSDT   && liveUSDT.value   > 0n  ? 'bg-emerald-500 animate-pulse' : 'bg-gray-800';
  const usdcDotClass = liveUSDC   && liveUSDC.value   > 0n  ? 'bg-emerald-500 animate-pulse' : 'bg-gray-800';

  return (
    <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden w-full shadow-2xl">

      {/* Score header */}
      <div className="px-6 pt-10 pb-8 border-b border-polkadot-border text-center space-y-4 bg-gradient-to-b from-white/5 to-transparent">
        <div className={`text-9xl font-bold font-mono tracking-tighter leading-none ${scoreColor(score)} drop-shadow-[0_0_15px_rgba(0,0,0,0.5)]`}>
          {score}
        </div>
        <div className="text-gray-500 text-xs font-mono uppercase tracking-widest">
          Credit Score <span className="text-gray-700">/ 1100</span>
        </div>

        {/* Big Score Bar */}
        <div className="max-w-xs mx-auto pt-2">
          <div className="h-2.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-out ${scoreBg(score)}`}
              style={{ width: `${(score / 1100) * 100}%` }}
            />
          </div>
        </div>

        {/* Status Badges */}
        <div className="flex items-center justify-center gap-2 pt-2">
          <span className={`text-[10px] font-bold px-3 py-1 rounded-full border uppercase tracking-tight ${
            score >= 750 ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' :
            score >= 500 ? 'border-amber-500/30 text-amber-400 bg-amber-500/10' :
            'border-orange-500/30 text-orange-400 bg-orange-500/10'
          }`}>
            {scoreLabel(score)}
          </span>
          <span className={`text-[10px] font-bold px-3 py-1 rounded-full border uppercase tracking-tight ${
            isValid ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-red-500/30 text-red-400 bg-red-500/10'
          }`}>
            {isValid ? '✦ Valid' : 'Expired'}
          </span>
        </div>

        <div className="text-[10px] text-gray-600 font-medium italic">
          {isValid ? `Next refresh available after ${fmt(expiry)}` : `Score expired on ${fmt(expiry)}`}
        </div>
      </div>

      {/* AI Reasoning */}
      <div className="px-8 py-6 border-b border-polkadot-border bg-black/10">
        <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-3">Mistral AI Analysis</div>
        <p className="text-gray-300 text-sm leading-relaxed font-medium italic">"{reasoning}"</p>
      </div>

      {/* Score breakdown */}
      <div className="px-8 py-8 border-b border-polkadot-border space-y-6">
        <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Risk Parameters</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
          <div className="space-y-6">
            <Bar label="Activity"  value={breakdown.transactionActivity} max={200} score={score} />
            <Bar label="Wallet Age" value={breakdown.accountAge}          max={100} score={score} />
            <Bar label="PAS Liquidity" value={breakdown.nativeBalance}    max={150} score={score} />
          </div>
          <div className="space-y-6">
            <Bar label="USDT Volume" value={breakdown.usdtHolding}       max={200} score={score} />
            <Bar label="USDC Volume" value={breakdown.usdcHolding}       max={150} score={score} />
            <Bar label="Complexity"  value={breakdown.accountComplexity} max={200} score={score} />
          </div>
        </div>
      </div>

      {/* Chain data grid */}
      <div className="px-8 py-6 bg-black/20">
        <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-4">On-Chain Evidence</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          
          <div className="bg-polkadot-dark/60 rounded-xl p-3 border border-white/5">
            <div className="text-[9px] text-gray-600 uppercase font-bold mb-1">PAS Balance</div>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${pasDotClass}`} />
              <span className="text-xs text-gray-300 font-mono truncate">{pasDisplay}</span>
            </div>
          </div>

          <div className="bg-polkadot-dark/60 rounded-xl p-3 border border-white/5">
            <div className="text-[9px] text-gray-600 uppercase font-bold mb-1">USDT (Native)</div>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${usdtDotClass}`} />
              <span className="text-xs text-gray-300 font-mono truncate">{usdtDisplay}</span>
            </div>
          </div>

          <div className="bg-polkadot-dark/60 rounded-xl p-3 border border-white/5">
            <div className="text-[9px] text-gray-600 uppercase font-bold mb-1">Nonce</div>
            <span className="text-xs text-gray-300 font-mono">#{rawChainData.nonce}</span>
          </div>

          <div className="bg-polkadot-dark/60 rounded-xl p-3 border border-white/5">
            <div className="text-[9px] text-gray-600 uppercase font-bold mb-1">Runtime</div>
            <span className="text-[10px] text-emerald-500 font-mono font-bold">v{Math.max(...rawChainData.metadataVersions)}</span>
          </div>

        </div>
      </div>
    </div>
  );
}
