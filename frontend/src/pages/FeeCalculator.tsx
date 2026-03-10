'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  useAccount, usePublicClient, useGasPrice, useBalance, useChainId,
} from 'wagmi';
import { parseEther, formatUnits } from 'viem';
import { pasTestnet, SCORE_NFT_PROXY } from '../utils/wagmi';

/* ─── contract references ─────────────────────────────────────── */
const LENDING_POOL  = (import.meta.env.VITE_LENDING_POOL ?? '') as `0x${string}`;
const ZERO_ADDR     = '0x0000000000000000000000000000000000000001' as `0x${string}`;
const EXPLORER      = 'https://polkadot.testnet.routescan.io';

/* ─── PAS price (testnet mock, user-adjustable) ───────────────── */
const DEFAULT_PAS_USD = 6.5; 

/* ─── transaction catalogue ──────────────────────────────────── */
interface TxType {
  id:       string;
  label:    string;
  category: 'transfer' | 'score' | 'lending';
  icon:     string;
  desc:     string;
  needsAmt: boolean;
  unit?:    string;
}

const TX_TYPES: TxType[] = [
  {
    id: 'transfer', label: 'Send PAS', category: 'transfer', icon: '↑',
    desc: 'Native PAS token transfer to any address.',
    needsAmt: true, unit: 'PAS',
  },
  {
    id: 'mint_score', label: 'Mint VeraScore', category: 'score', icon: '◈',
    desc: 'Mint or refresh your VeraScore soulbound NFT on-chain.',
    needsAmt: false,
  },
  {
    id: 'deposit', label: 'Deposit Collateral', category: 'lending', icon: '⬇',
    desc: 'Deposit PAS as collateral into the lending pool.',
    needsAmt: true, unit: 'PAS',
  },
  {
    id: 'borrow', label: 'Borrow PAS', category: 'lending', icon: '↗',
    desc: 'Borrow PAS from the pool against your collateral.',
    needsAmt: true, unit: 'PAS',
  },
  {
    id: 'repay', label: 'Repay Debt', category: 'lending', icon: '↩',
    desc: 'Repay outstanding debt plus interest.',
    needsAmt: true, unit: 'PAS',
  },
  {
    id: 'withdraw', label: 'Withdraw Collateral', category: 'lending', icon: '⬆',
    desc: 'Withdraw available collateral from the pool.',
    needsAmt: true, unit: 'PAS',
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  transfer: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  score:    'text-polkadot-pink border-pink-500/30 bg-pink-500/10',
  lending:  'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
};

const POOL_ABI = [
  { name: 'deposit',  type: 'function', stateMutability: 'payable',     inputs: [], outputs: [] },
  { name: 'borrow',   type: 'function', stateMutability: 'nonpayable',  inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'repay',    type: 'function', stateMutability: 'payable',     inputs: [], outputs: [] },
  { name: 'withdraw', type: 'function', stateMutability: 'nonpayable',  inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
] as const;

interface FeeResult {
  gasUnits:   bigint;
  gasPrice:   bigint;
  feePAS:     number;
  feeUSD:     number;
  feeUSDC:    number;
  totalPAS:   number;
  totalUSD:   number;
}

export function FeeCalculator() {
  const { address, isConnected } = useAccount();
  const chainId                  = useChainId();
  const client                   = usePublicClient({ chainId: pasTestnet.id });

  const { data: gasPriceData, refetch: refetchGas } = useGasPrice({ chainId: pasTestnet.id });
  const { data: balData }                           = useBalance({ address, chainId: pasTestnet.id });

  const [selectedTx, setSelectedTx] = useState<TxType>(TX_TYPES[0]);
  const [amount,     setAmount]     = useState('1');
  const [pasUsd,     setPasUsd]     = useState(DEFAULT_PAS_USD.toString());
  const [result,     setResult]     = useState<FeeResult | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [lastCalc,   setLastCalc]   = useState<Date | null>(null);

  const estimate = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError('');
    
    try {
      await refetchGas();
      const gasPrice = gasPriceData ?? 1000000000n; 
      const from     = address ?? ZERO_ADDR;
      const amtWei   = parseEther(amount || '0');
      const pasPrice = parseFloat(pasUsd) || DEFAULT_PAS_USD;

      let gasUnits: bigint;

      switch (selectedTx.id) {
        case 'transfer':
          gasUnits = await client.estimateGas({ account: from, to: ZERO_ADDR, value: amtWei });
          break;
        case 'mint_score':
          // Actual mintScore with proxy logic uses ~145k gas pa!
          gasUnits = 145000n;
          break;
        case 'deposit':
          gasUnits = await client.estimateContractGas({
            address: LENDING_POOL, abi: POOL_ABI, functionName: 'deposit', account: from, value: amtWei,
          }).catch(() => 95000n);
          break;
        case 'borrow':
          gasUnits = await client.estimateContractGas({
            address: LENDING_POOL, abi: POOL_ABI, functionName: 'borrow', account: from, args: [amtWei],
          }).catch(() => 110000n);
          break;
        case 'repay':
          gasUnits = await client.estimateContractGas({
            address: LENDING_POOL, abi: POOL_ABI, functionName: 'repay', account: from, value: amtWei,
          }).catch(() => 85000n);
          break;
        case 'withdraw':
          gasUnits = await client.estimateContractGas({
            address: LENDING_POOL, abi: POOL_ABI, functionName: 'withdraw', account: from, args: [amtWei],
          }).catch(() => 90000n);
          break;
        default:
          gasUnits = 21000n;
      }

      const feeWei  = gasUnits * gasPrice;
      const feePAS  = Number(formatUnits(feeWei, 18));
      const feeUSD  = feePAS * pasPrice;
      const amtNum  = parseFloat(amount || '0');

      setResult({
        gasUnits, gasPrice, feePAS, feeUSD, feeUSDC: feeUSD,
        totalPAS: feePAS + (selectedTx.needsAmt ? amtNum : 0),
        totalUSD: feeUSD + (selectedTx.needsAmt ? amtNum * pasPrice : 0),
      });
      setLastCalc(new Date());
    } catch (e: any) {
      setError(e.message.includes('insufficient') ? 'Balance too low for estimation.' : 'Execution error on-chain.');
    } finally {
      setLoading(false);
    }
  }, [client, address, selectedTx, amount, pasUsd, gasPriceData, refetchGas]);

  useEffect(() => {
    if (isConnected && client) estimate();
  }, [selectedTx.id, isConnected, client, estimate]);

  const balance = balData ? Number(balData.value) / 1e18 : null;

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-12">
      
      <div className="space-y-2">
        <h1 className="text-3xl font-black tracking-tighter uppercase italic text-white">
          Fee <span className="text-polkadot-pink text-4xl">Calculator</span>
        </h1>
        <p className="text-gray-500 text-sm font-medium uppercase tracking-widest">
          Real-Time Gas Metrics · Paseo Parachain Stats
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* Controls */}
        <div className="xl:col-span-4 space-y-6">
          <div className="bg-polkadot-card border border-polkadot-border rounded-3xl overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-polkadot-border bg-black/20 text-[10px] text-gray-500 font-black uppercase tracking-widest">
              Operation Type
            </div>
            <div className="p-4 space-y-2">
              {TX_TYPES.map(tx => (
                <button
                  key={tx.id}
                  onClick={() => { setSelectedTx(tx); setResult(null); }}
                  className={`w-full text-left px-4 py-3.5 rounded-2xl flex items-center gap-4 transition-all border ${
                    selectedTx.id === tx.id ? 'bg-polkadot-pink/10 border-polkadot-pink/30 shadow-inner' : 'border-transparent text-gray-500 hover:bg-white/5'
                  }`}
                >
                  <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-lg border shrink-0 ${
                    selectedTx.id === tx.id ? CATEGORY_COLORS[tx.category] : 'border-polkadot-border text-gray-700'
                  }`}>
                    {tx.icon}
                  </span>
                  <div className="flex-1">
                    <div className={`text-sm font-black uppercase tracking-tight ${selectedTx.id === tx.id ? 'text-white' : 'text-gray-500'}`}>{tx.label}</div>
                    <div className="text-[9px] font-bold text-gray-600 uppercase tracking-tighter truncate">{tx.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {selectedTx.needsAmt && (
            <div className="bg-polkadot-card border border-polkadot-border rounded-3xl p-6 space-y-4 shadow-xl">
              <div className="flex justify-between items-end">
                <label className="text-[10px] text-gray-600 font-black uppercase tracking-widest">Transaction Volume</label>
                {balance !== null && <span className="text-[9px] font-bold text-polkadot-pink uppercase">Bal: {balance.toFixed(2)} PAS</span>}
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full bg-polkadot-dark border border-polkadot-border rounded-2xl px-5 py-4 text-xl font-mono text-white outline-none focus:border-polkadot-pink/40 shadow-inner"
                />
                <div className="absolute right-5 top-1/2 -translate-y-1/2 font-black text-xs text-gray-600 uppercase">{selectedTx.unit}</div>
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="xl:col-span-8 space-y-6">
          <div className="bg-polkadot-card border border-polkadot-border rounded-3xl overflow-hidden shadow-2xl">
            <div className="px-8 py-5 border-b border-polkadot-border flex items-center justify-between bg-black/20">
              <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest">On-Chain Estimate</div>
              <button onClick={estimate} disabled={loading} className="bg-polkadot-pink text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-polkadot-pink/10 hover:scale-105 transition-all">
                {loading ? 'Calculating...' : '↻ Re-Sync'}
              </button>
            </div>

            <div className="p-8 space-y-8">
              {result ? (
                <div className="space-y-8 animate-in fade-in duration-500">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-polkadot-dark/60 border border-white/5 rounded-2xl p-6 space-y-1 shadow-inner">
                      <div className="text-[9px] text-gray-600 font-black uppercase tracking-widest">Gas Cost</div>
                      <div className="text-2xl font-black font-mono text-white tracking-tighter">{result.feePAS.toFixed(6)}</div>
                      <div className="text-[10px] font-bold text-gray-700 uppercase">PAS Token</div>
                    </div>
                    <div className="bg-polkadot-dark/60 border border-white/5 rounded-2xl p-6 space-y-1 shadow-inner">
                      <div className="text-[9px] text-gray-600 font-black uppercase tracking-widest">USD Value</div>
                      <div className="text-2xl font-black font-mono text-emerald-400 tracking-tighter">${result.feeUSD.toFixed(4)}</div>
                      <div className="text-[10px] font-bold text-gray-700 uppercase">@ ${parseFloat(pasUsd).toFixed(2)}/PAS</div>
                    </div>
                    <div className="bg-polkadot-dark/60 border border-white/5 rounded-2xl p-6 space-y-1 shadow-inner">
                      <div className="text-[9px] text-gray-600 font-black uppercase tracking-widest">Gas Units</div>
                      <div className="text-2xl font-black font-mono text-blue-400 tracking-tighter">{result.gasUnits.toLocaleString()}</div>
                      <div className="text-[10px] font-bold text-gray-700 uppercase">Computational Work</div>
                    </div>
                  </div>

                  <div className="bg-black/20 rounded-2xl p-4 border border-white/5 font-mono text-[10px] text-gray-600 flex items-center gap-2">
                    <span className="text-emerald-500 font-bold uppercase tracking-tighter">Formula:</span>
                    <span>{result.gasUnits.toLocaleString()} units × {(Number(result.gasPrice)/1e9).toFixed(3)} Gwei = {result.feePAS.toFixed(6)} PAS</span>
                  </div>
                </div>
              ) : (
                <div className="py-20 text-center space-y-4 opacity-40">
                  <div className="text-6xl">⛽</div>
                  <div className="text-sm font-black uppercase tracking-widest">Awaiting Parameter Input</div>
                </div>
              )}
            </div>
          </div>

          {/* Reference Table */}
          <div className="bg-polkadot-card border border-polkadot-border rounded-3xl overflow-hidden shadow-xl">
             <div className="px-8 py-4 border-b border-polkadot-border bg-black/20 text-[10px] text-gray-500 font-black uppercase tracking-widest">Network Benchmarks</div>
             <div className="overflow-x-auto">
               <table className="w-full text-left">
                 <thead className="bg-black/10 border-b border-white/5">
                   <tr>
                     <th className="px-8 py-4 text-[9px] font-black text-gray-700 uppercase tracking-widest">Operation</th>
                     <th className="px-4 py-4 text-[9px] font-black text-gray-700 uppercase tracking-widest text-right">Gas Units</th>
                     <th className="px-8 py-4 text-[9px] font-black text-gray-700 uppercase tracking-widest text-right">Cost (PAS)</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-white/5">
                   {TX_TYPES.map(row => (
                     <tr key={row.id} className="hover:bg-white/[0.02] transition-colors">
                       <td className="px-8 py-4 text-xs font-bold text-gray-400 uppercase tracking-tighter">{row.label}</td>
                       <td className="px-4 py-4 text-xs font-mono text-gray-500 text-right">~{row.id === 'mint_score' ? '145,000' : '21,000+'}</td>
                       <td className="px-8 py-4 text-xs font-mono text-emerald-500/80 text-right">LIVE</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
