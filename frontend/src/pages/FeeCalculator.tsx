import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount, usePublicClient, useBalance, useChainId } from 'wagmi';
import { parseEther, formatUnits } from 'viem';
import { pasTestnet } from '../utils/wagmi.js';

const LENDING_POOL    = (import.meta.env.VITE_LENDING_POOL ?? '') as `0x${string}`;
const ZERO_ADDR       = '0x0000000000000000000000000000000000000001' as `0x${string}`;
const DEFAULT_PAS_USD = 6.5;

interface TxType {
  id:          string;
  label:       string;
  category:    'transfer' | 'score' | 'lending';
  icon:        string;
  desc:        string;
  needsAmt:    boolean;
  unit?:       string;
  fallbackGas: bigint;
}

const TX_TYPES: TxType[] = [
  { id: 'transfer',   label: 'Send PAS',            category: 'transfer', icon: '↑', needsAmt: true,  unit: 'PAS', fallbackGas: 21_000n,
    desc: 'Native PAS token transfer.' },
  { id: 'mint_score', label: 'Mint VeraScore',      category: 'score',    icon: '◈', needsAmt: false, fallbackGas: 145_000n,
    desc: 'Mint or refresh VeraScore NFT.' },
  { id: 'deposit',    label: 'Deposit Collateral',  category: 'lending',  icon: '⬇', needsAmt: true,  unit: 'PAS', fallbackGas: 95_000n,
    desc: 'Deposit PAS as collateral.' },
  { id: 'borrow',     label: 'Borrow PAS',          category: 'lending',  icon: '↗', needsAmt: true,  unit: 'PAS', fallbackGas: 110_000n,
    desc: 'Borrow PAS from pool.' },
  { id: 'repay',      label: 'Repay Debt',          category: 'lending',  icon: '↩', needsAmt: true,  unit: 'PAS', fallbackGas: 85_000n,
    desc: 'Repay outstanding debt.' },
  { id: 'withdraw',   label: 'Withdraw Collateral', category: 'lending',  icon: '⬆', needsAmt: true,  unit: 'PAS', fallbackGas: 90_000n,
    desc: 'Withdraw available collateral.' },
];

const CAT_COLOR: Record<string, string> = {
  transfer: 'text-blue-400   border-blue-500/30   bg-blue-500/10',
  score:    'text-polkadot-pink border-pink-500/30 bg-pink-500/10',
  lending:  'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
};

const POOL_ABI = [
  { name: 'deposit',  type: 'function', stateMutability: 'payable',    inputs: [], outputs: [] },
  { name: 'borrow',   type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'repay',    type: 'function', stateMutability: 'payable',    inputs: [], outputs: [] },
  { name: 'withdraw', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
] as const;

interface FeeResult {
  gasUnits: bigint; gasPrice: bigint;
  feePAS: number;   feeUSD: number;
  totalPAS: number; totalUSD: number;
}

export function FeeCalculator() {
  const { address, isConnected } = useAccount();
  const chainId                  = useChainId();
  const client                   = usePublicClient({ chainId: pasTestnet.id });
  const { data: balData }        = useBalance({ address, chainId: pasTestnet.id });

  const [selectedTx, setSelectedTx] = useState<TxType>(TX_TYPES[0]);
  const [amount,     setAmount]     = useState('1');
  const [pasUsd,     setPasUsd]     = useState(DEFAULT_PAS_USD.toString());
  const [result,     setResult]     = useState<FeeResult | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [lastCalc,   setLastCalc]   = useState<Date | null>(null);

  const txRef  = useRef(selectedTx);
  const amtRef = useRef(amount);
  const pasRef = useRef(pasUsd);
  useEffect(() => { txRef.current  = selectedTx; }, [selectedTx]);
  useEffect(() => { amtRef.current = amount;      }, [amount]);
  useEffect(() => { pasRef.current = pasUsd;      }, [pasUsd]);

  const estimate = useCallback(async () => {
    if (!client) return;
    setLoading(true); setError('');
    const tx       = txRef.current;
    const amtStr   = amtRef.current;
    const pasPrice = parseFloat(pasRef.current) || DEFAULT_PAS_USD;
    const from     = address ?? ZERO_ADDR;
    const amtWei   = parseEther(amtStr || '0');

    try {
      let gasPrice = 1_000_000_000n;
      try { gasPrice = await client.getGasPrice(); } catch { /* fallback */ }

      let gasUnits: bigint;
      switch (tx.id) {
        case 'transfer':
          gasUnits = await client.estimateGas({ account: from, to: ZERO_ADDR, value: amtWei }).catch(() => tx.fallbackGas);
          break;
        case 'mint_score':
          gasUnits = tx.fallbackGas;
          break;
        case 'deposit':
          gasUnits = LENDING_POOL
            ? await client.estimateContractGas({ address: LENDING_POOL, abi: POOL_ABI, functionName: 'deposit', account: from, value: amtWei }).catch(() => tx.fallbackGas)
            : tx.fallbackGas;
          break;
        case 'borrow':
          gasUnits = LENDING_POOL
            ? await client.estimateContractGas({ address: LENDING_POOL, abi: POOL_ABI, functionName: 'borrow', account: from, args: [amtWei] }).catch(() => tx.fallbackGas)
            : tx.fallbackGas;
          break;
        case 'repay':
          gasUnits = LENDING_POOL
            ? await client.estimateContractGas({ address: LENDING_POOL, abi: POOL_ABI, functionName: 'repay', account: from, value: amtWei }).catch(() => tx.fallbackGas)
            : tx.fallbackGas;
          break;
        case 'withdraw':
          gasUnits = LENDING_POOL
            ? await client.estimateContractGas({ address: LENDING_POOL, abi: POOL_ABI, functionName: 'withdraw', account: from, args: [amtWei] }).catch(() => tx.fallbackGas)
            : tx.fallbackGas;
          break;
        default:
          gasUnits = 21_000n;
      }

      const feeWei = gasUnits * gasPrice;
      const feePAS = Number(formatUnits(feeWei, 18));
      const feeUSD = feePAS * pasPrice;
      const amtNum = parseFloat(amtStr || '0');
      setResult({ gasUnits, gasPrice, feePAS, feeUSD,
        totalPAS: feePAS + (tx.needsAmt ? amtNum : 0),
        totalUSD: feeUSD + (tx.needsAmt ? amtNum * pasPrice : 0),
      });
      setLastCalc(new Date());
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? '';
      setError(msg.includes('insufficient') ? 'Balance too low for estimation.' : 'Estimation failed — showing fallback values.');
      const gasPrice = 1_000_000_000n;
      const gasUnits = tx.fallbackGas;
      const feePAS   = Number(formatUnits(gasUnits * gasPrice, 18));
      const feeUSD   = feePAS * (parseFloat(pasRef.current) || DEFAULT_PAS_USD);
      const amtNum   = parseFloat(amtStr || '0');
      setResult({ gasUnits, gasPrice, feePAS, feeUSD,
        totalPAS: feePAS + (tx.needsAmt ? amtNum : 0),
        totalUSD: feeUSD + (tx.needsAmt ? amtNum * feeUSD : 0),
      });
    } finally { setLoading(false); }
  }, [client, address]);

  useEffect(() => {
    if (isConnected && client) estimate();
  }, [selectedTx.id, isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  const balance = balData ? Number(balData.value) / 1e18 : null;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-black tracking-tight text-white">
          Fee <span className="text-polkadot-pink">Calculator</span>
        </h1>
        <p className="text-[10px] text-gray-600 mt-0.5 font-medium">
          Real-time gas estimates · Paseo Hub
        </p>
      </div>

      {/* Operation selector */}
      <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-polkadot-border bg-black/20">
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Operation Type</span>
        </div>
        <div className="p-2 grid grid-cols-2 gap-1.5">
          {TX_TYPES.map(tx => (
            <button key={tx.id}
              onClick={() => { setSelectedTx(tx); setResult(null); setError(''); }}
              className={`text-left px-3 py-2.5 rounded-xl flex items-center gap-2.5 transition-all border ${
                selectedTx.id === tx.id
                  ? 'bg-polkadot-pink/10 border-polkadot-pink/30'
                  : 'border-transparent text-gray-600 hover:bg-white/5'
              }`}>
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm border shrink-0 ${
                selectedTx.id === tx.id ? CAT_COLOR[tx.category] : 'border-polkadot-border text-gray-700'
              }`}>{tx.icon}</span>
              <div className="min-w-0">
                <div className={`text-[10px] font-black uppercase tracking-tight truncate ${selectedTx.id === tx.id ? 'text-white' : 'text-gray-500'}`}>
                  {tx.label}
                </div>
                <div className="text-[8px] text-gray-700 truncate">{tx.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Inputs row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {selectedTx.needsAmt && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="text-[8px] font-bold uppercase tracking-widest text-gray-700">Amount</div>
              {balance !== null && (
                <span className="text-[8px] font-bold text-polkadot-pink">Bal: {balance.toFixed(4)} PAS</span>
              )}
            </div>
            <div className="relative">
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full bg-polkadot-card border border-polkadot-border rounded-xl px-4 py-2.5 text-sm font-mono text-white outline-none focus:border-polkadot-pink/40" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-gray-700 uppercase">{selectedTx.unit}</span>
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          <div className="text-[8px] font-bold uppercase tracking-widest text-gray-700">PAS Price (USD)</div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 font-bold text-sm">$</span>
            <input type="number" value={pasUsd} step="0.1" min="0"
              onChange={e => setPasUsd(e.target.value)}
              className="w-full bg-polkadot-card border border-polkadot-border rounded-xl pl-7 pr-4 py-2.5 text-sm font-mono text-white outline-none focus:border-polkadot-pink/40" />
          </div>
        </div>
      </div>

      {/* Results card */}
      <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden shadow-xl">
        <div className="px-4 py-3 border-b border-polkadot-border bg-black/20 flex items-center justify-between">
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">On-Chain Estimate</span>
            {lastCalc && <span className="text-[8px] text-gray-700 font-mono ml-2">{lastCalc.toLocaleTimeString()}</span>}
          </div>
          <button onClick={estimate} disabled={loading}
            className="bg-polkadot-pink hover:bg-pink-600 text-white px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-40">
            {loading ? 'Calculating…' : '↻ Re-Sync'}
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-3 py-2 text-[9px] font-semibold text-yellow-400">
              ⚠ {error}
            </div>
          )}

          {result ? (
            <div className="space-y-3">
              {/* 3 metric cells */}
              <div className="grid grid-cols-3 gap-px bg-polkadot-border rounded-xl overflow-hidden">
                {[
                  { label: 'Gas Cost',  value: result.feePAS.toFixed(6), sub: 'PAS',           color: 'text-white'         },
                  { label: 'USD Value', value: `$${result.feeUSD.toFixed(4)}`, sub: `@ $${parseFloat(pasUsd).toFixed(2)}/PAS`, color: 'text-emerald-400' },
                  { label: 'Gas Units', value: result.gasUnits.toLocaleString(), sub: 'Compute', color: 'text-blue-400'  },
                ].map(({ label, value, sub, color }) => (
                  <div key={label} className="bg-polkadot-card px-3 py-3 space-y-0.5">
                    <div className="text-[8px] font-bold uppercase tracking-widest text-gray-700">{label}</div>
                    <div className={`text-sm font-black font-mono ${color}`}>{value}</div>
                    <div className="text-[8px] text-gray-700 uppercase">{sub}</div>
                  </div>
                ))}
              </div>

              {/* Formula */}
              <div className="bg-black/20 border border-white/5 rounded-xl px-3 py-2 font-mono text-[9px] text-gray-600">
                <span className="text-emerald-500 font-bold">Formula: </span>
                {result.gasUnits.toLocaleString()} × {(Number(result.gasPrice) / 1e9).toFixed(3)} Gwei = {result.feePAS.toFixed(8)} PAS
              </div>

              {/* Total if amount applicable */}
              {selectedTx.needsAmt && parseFloat(amount) > 0 && (
                <div className="grid grid-cols-2 gap-px bg-polkadot-border rounded-xl overflow-hidden">
                  <div className="bg-polkadot-card px-3 py-3">
                    <div className="text-[8px] font-bold uppercase tracking-widest text-gray-700 mb-0.5">Total Required</div>
                    <div className="text-sm font-black font-mono text-white">{result.totalPAS.toFixed(6)} PAS</div>
                  </div>
                  <div className="bg-polkadot-card px-3 py-3">
                    <div className="text-[8px] font-bold uppercase tracking-widest text-gray-700 mb-0.5">Total USD</div>
                    <div className="text-sm font-black font-mono text-emerald-400">${result.totalUSD.toFixed(4)}</div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-10 text-center opacity-40 space-y-2">
              <div className="text-4xl">⛽</div>
              <div className="text-xs font-black uppercase tracking-widest">
                {loading ? 'Calculating gas…' : 'Select operation and click Re-Sync'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Benchmarks table */}
      <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-polkadot-border bg-black/20">
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Network Benchmarks</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-black/10 border-b border-white/5">
              <tr>
                <th className="px-4 py-2.5 text-[8px] font-black text-gray-700 uppercase tracking-widest">Operation</th>
                <th className="px-3 py-2.5 text-[8px] font-black text-gray-700 uppercase tracking-widest text-right">Gas Units</th>
                <th className="px-4 py-2.5 text-[8px] font-black text-gray-700 uppercase tracking-widest text-right">~PAS Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {TX_TYPES.map(row => {
                const gasUnits = (result && selectedTx.id === row.id) ? result.gasUnits : row.fallbackGas;
                const gasPrice = result ? result.gasPrice : 1_000_000_000n;
                const cost     = Number(gasUnits * gasPrice) / 1e18;
                return (
                  <tr key={row.id}
                    onClick={() => { setSelectedTx(row); setResult(null); setError(''); }}
                    className={`cursor-pointer transition-colors ${selectedTx.id === row.id ? 'bg-polkadot-pink/5' : 'hover:bg-white/[0.02]'}`}>
                    <td className="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase">
                      {selectedTx.id === row.id && <span className="text-polkadot-pink mr-1">▶</span>}
                      {row.label}
                    </td>
                    <td className="px-3 py-2.5 text-[10px] font-mono text-gray-600 text-right">~{gasUnits.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-[10px] font-mono text-right">
                      <span className={selectedTx.id === row.id ? 'text-emerald-400' : 'text-emerald-600/50'}>
                        {cost.toFixed(6)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}