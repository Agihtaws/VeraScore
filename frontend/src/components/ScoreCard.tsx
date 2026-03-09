import { useBalance }                              from 'wagmi';
import { pasTestnet, USDT_ERC20, USDC_ERC20,
         STABLECOIN_DECIMALS }                     from '../utils/wagmi.js';
import type { ScorePayload }                       from '../hooks/useScore.js';

interface Props {
  payload:   ScorePayload;
  expiresAt?: number;
}

function scoreColor(score: number) {
  if (score >= 750) return 'text-green-400';
  if (score >= 500) return 'text-yellow-400';
  if (score >= 250) return 'text-orange-400';
  return 'text-red-400';
}

function scoreBg(score: number) {
  if (score >= 750) return 'bg-green-400';
  if (score >= 500) return 'bg-yellow-400';
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
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="text-white font-mono">
          {value}<span className="text-gray-600">/{max}</span>
        </span>
      </div>
      <div className="h-1.5 bg-polkadot-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${scoreBg(score)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function ScoreCard({ payload, expiresAt }: Props) {
  const { score, reasoning, breakdown, rawChainData, alreadyHadScore } = payload;

  const expiry  = expiresAt ?? Math.floor(rawChainData.queriedAt / 1000) + 30 * 24 * 3600;
  const isValid = Math.floor(Date.now() / 1000) <= expiry;

  // Live PAS balance — polls every 10s so the card stays fresh after swaps/transfers
  const {
    data:      liveBalance,
    isLoading: pasLoading,
    isError:   pasError,
  } = useBalance({
    address:  rawChainData.address as `0x${string}`,
    chainId:  pasTestnet.id,
    query: {
      refetchInterval: 10_000,
      staleTime:       10_000,
      retry:           2,
    },
  });

  // Live USDT balance via ERC-20 precompile (Substrate asset ID 1984)
  const {
    data:      liveUSDT,
    isLoading: usdtLoading,
    isError:   usdtError,
  } = useBalance({
    address:  rawChainData.address as `0x${string}`,
    token:    USDT_ERC20,
    chainId:  pasTestnet.id,
    query: {
      refetchInterval: 10_000,
      staleTime:       10_000,
      retry:           2,
    },
  });

  // Live USDC balance via ERC-20 precompile (Substrate asset ID 1337)
  // NOTE: USDC (asset 1337) is not deployed on PAS TestNet — precompile returns 0.
  // retry:0 + no refetch interval stops it from hammering the RPC every 10s.
  const {
    data:      liveUSDC,
    isLoading: usdcLoading,
    isError:   usdcError,
  } = useBalance({
    address:  rawChainData.address as `0x${string}`,
    token:    USDC_ERC20,
    chainId:  pasTestnet.id,
    query: {
      refetchInterval: false,
      staleTime:       Infinity,
      retry:           0,
    },
  });

  // ── Formatters ─────────────────────────────────────────────────────────────

  /** Format a stablecoin bigint (6 decimals) to a human-readable string */
  function formatStable(value: bigint, symbol: string): string {
    const units = 10n ** BigInt(STABLECOIN_DECIMALS);
    const whole  = value / units;
    const frac   = value % units;
    const fracStr = frac.toString().padStart(STABLECOIN_DECIMALS, '0').replace(/0+$/, '');
    return fracStr.length > 0
      ? `${whole.toLocaleString()}.${fracStr} ${symbol}`
      : `${whole.toLocaleString()} ${symbol}`;
  }

  /** Format a stablecoin raw string (6 decimals, from PAPI) to human-readable */
  function formatStableRaw(raw: string, symbol: string): string {
    try {
      const v = BigInt(raw);
      if (v === 0n) return '—';
      return formatStable(v, symbol);
    } catch { return raw; }
  }

  // Resolved display values:
  // - loading → show PAPI snapshot (skeleton dot)
  // - error   → show PAPI snapshot (no dot, silent fallback)
  // - data    → show live value (green dot)

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

  // Dot states:
  // Dot only shows when confirmed live balance > 0 — no amber flash during load
  const pasDotClass  = liveBalance && liveBalance.value > 0n ? 'bg-green-500 animate-pulse' : null;
  const usdtDotClass = liveUSDT   && liveUSDT.value   > 0n  ? 'bg-green-500 animate-pulse' : null;
  const usdcDotClass = liveUSDC   && liveUSDC.value   > 0n  ? 'bg-green-500 animate-pulse' : null;

  return (
    <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden w-full">

      {/* Score header */}
      <div className="px-6 pt-8 pb-5 border-b border-polkadot-border text-center space-y-3">

        {/* Large score number */}
        <div className={`text-8xl font-bold font-mono leading-none ${scoreColor(score)}`}>
          {score}
        </div>
        <div className="text-gray-500 text-xs">out of 1000</div>

        {/* Score bar */}
        <div className="max-w-xs mx-auto space-y-1">
          <div className="h-2 bg-polkadot-border rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${scoreBg(score)}`}
              style={{ width: `${(score / 1000) * 100}%` }}
            />
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${
            score >= 750 ? 'border-green-800  text-green-400  bg-green-950'  :
            score >= 500 ? 'border-yellow-800 text-yellow-400 bg-yellow-950' :
            score >= 250 ? 'border-orange-800 text-orange-400 bg-orange-950' :
                           'border-red-800    text-red-400    bg-red-950'
          }`}>
            {scoreLabel(score)}
          </span>
          {isValid ? (
            <span className="text-xs font-semibold px-3 py-1 rounded-full border border-green-800 text-green-400 bg-green-950">
              ✓ Valid
            </span>
          ) : (
            <span className="text-xs font-semibold px-3 py-1 rounded-full border border-red-800 text-red-400 bg-red-950">
              Expired
            </span>
          )}
          {alreadyHadScore && (
            <span className="text-xs font-semibold px-3 py-1 rounded-full border border-blue-800 text-blue-400 bg-blue-950">
              Refreshed
            </span>
          )}
          {rawChainData.hasForeignAssets && (
            <span className="text-xs font-semibold px-3 py-1 rounded-full border border-purple-800 text-purple-400 bg-purple-950">
              ✦ Cross-Chain
            </span>
          )}
        </div>

        {/* Expiry */}
        <div className="text-xs text-gray-500">
          {isValid
            ? `Valid until ${fmt(expiry)}`
            : `Expired on ${fmt(expiry)} — refresh to renew`}
        </div>
      </div>

      {/* AI Reasoning */}
      <div className="px-6 py-4 border-b border-polkadot-border">
        <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">AI Reasoning</div>
        <p className="text-gray-300 text-sm leading-relaxed">{reasoning}</p>
      </div>

      {/* Score breakdown */}
      <div className="px-6 py-5 border-b border-polkadot-border space-y-4">
        <div className="text-xs text-gray-500 uppercase tracking-widest">Score Breakdown</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-4">
            <Bar label="Transaction Activity" value={breakdown.transactionActivity} max={200} score={score} />
            <Bar label="Account Age"          value={breakdown.accountAge}          max={100} score={score} />
            <Bar label="Native PAS Balance"   value={breakdown.nativeBalance}       max={150} score={score} />
          </div>
          <div className="space-y-4">
            <Bar label="USDT Holding"         value={breakdown.usdtHolding}         max={200} score={score} />
            <Bar label="USDC Holding"         value={breakdown.usdcHolding}         max={150} score={score} />
            <Bar label="Account Complexity"   value={breakdown.accountComplexity}   max={200} score={score} />
            <Bar label="Runtime Modernity"    value={breakdown.runtimeModernity ?? 0} max={100} score={score} />
          </div>
        </div>
      </div>

      {/* Chain data */}
      <div className="px-6 py-4">
        <div className="text-xs text-gray-500 uppercase tracking-widest mb-3">Chain Data</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">

          {/* PAS Balance — rendered separately because it contains a JSX live indicator */}
          <div className="bg-polkadot-dark rounded-lg px-3 py-2 space-y-0.5">
            <div className="text-gray-600 text-[10px] uppercase tracking-wider">PAS Balance</div>
            <div className="text-gray-300 font-mono text-xs truncate flex items-center gap-1.5">
              {pasDisplay}
              {pasDotClass && (
                <span
                  title={pasLoading ? 'Fetching live balance…' : 'Live balance from chain'}
                  className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${pasDotClass}`}
                />
              )}
            </div>
          </div>

          {/* Static string rows — no live indicator needed */}
          {(
            [
              ['Transactions',      rawChainData.nonce.toString()],
              ['Metadata Versions', rawChainData.metadataVersions.join(', ')],
              ['WETH (Bridged)',     rawChainData.wethBalance === '0' ? '—' : rawChainData.wethBalance],
              ['Cross-Chain',       rawChainData.hasForeignAssets ? '✦ Active' : '—'],
              ['Status',            alreadyHadScore ? 'Refreshed' : 'First mint'],
            ] as [string, string][]
          ).map(([label, value]) => (
            <div key={label} className="bg-polkadot-dark rounded-lg px-3 py-2 space-y-0.5">
              <div className="text-gray-600 text-[10px] uppercase tracking-wider">{label}</div>
              <div className="text-gray-300 font-mono text-xs truncate">{value}</div>
            </div>
          ))}

          {/* USDT — live via ERC-20 precompile (asset ID 1984), falls back to PAPI snapshot */}
          <div className="bg-polkadot-dark rounded-lg px-3 py-2 space-y-0.5">
            <div className="text-gray-600 text-[10px] uppercase tracking-wider">USDT</div>
            <div className="text-gray-300 font-mono text-xs truncate flex items-center gap-1.5">
              {usdtDisplay}
              {usdtDotClass && (
                <span
                  title={usdtLoading ? 'Fetching live USDT balance…' : 'Live USDT from ERC-20 precompile'}
                  className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${usdtDotClass}`}
                />
              )}
            </div>
          </div>

          {/* USDC — live via ERC-20 precompile (asset ID 1337), falls back to PAPI snapshot */}
          <div className="bg-polkadot-dark rounded-lg px-3 py-2 space-y-0.5">
            <div className="text-gray-600 text-[10px] uppercase tracking-wider">USDC</div>
            <div className="text-gray-300 font-mono text-xs truncate flex items-center gap-1.5">
              {usdcDisplay}
              {usdcDotClass && (
                <span
                  title={usdcLoading ? 'Fetching live USDC balance…' : 'Live USDC from ERC-20 precompile'}
                  className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${usdcDotClass}`}
                />
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}