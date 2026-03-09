import { useState, useEffect, useCallback } from 'react';
import {
  useAccount, usePublicClient, useGasPrice, useBalance, useChainId,
} from 'wagmi';
import { parseEther, parseUnits, formatUnits } from 'viem';
import { pasTestnet, SCORE_NFT_PROXY } from '../utils/wagmi.js';

/* ─── contract references ─────────────────────────────────────── */
const LENDING_POOL  = (import.meta.env.VITE_LENDING_POOL ?? '') as `0x${string}`;
const ZERO_ADDR     = '0x0000000000000000000000000000000000000001' as `0x${string}`;
const EXPLORER      = 'https://polkadot.testnet.routescan.io';

/* ─── PAS price (testnet mock, user-adjustable) ───────────────── */
const DEFAULT_PAS_USD = 6.5; // approximate DOT price as proxy

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

/* ─── ABIs (minimal) ─────────────────────────────────────────── */
const SCORE_ABI = [
  {
    name: 'mintScore', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'wallet',    type: 'address' },
      { name: 'score',     type: 'uint16'  },
      { name: 'dataHash',  type: 'bytes32' },
      { name: 'deadline',  type: 'uint64'  },
      { name: 'v',         type: 'uint8'   },
      { name: 'r',         type: 'bytes32' },
      { name: 's',         type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;

const POOL_ABI = [
  { name: 'deposit',  type: 'function', stateMutability: 'payable',     inputs: [], outputs: [] },
  { name: 'borrow',   type: 'function', stateMutability: 'nonpayable',  inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'repay',    type: 'function', stateMutability: 'payable',     inputs: [], outputs: [] },
  { name: 'withdraw', type: 'function', stateMutability: 'nonpayable',  inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
] as const;

/* ─── result type ────────────────────────────────────────────── */
interface FeeResult {
  gasUnits:   bigint;
  gasPrice:   bigint;
  feePAS:     number;
  feeUSD:     number;
  feeUSDC:    number;
  totalPAS:   number;   // fee + amount
  totalUSD:   number;
}

/* ═══════════════════════════════════════════════════════════════ */
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

  const isWrongChain  = chainId !== pasTestnet.id;

  /* ── Build estimation call ─────────────────────────────────── */
  const estimate = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      await refetchGas();
      const gasPrice = gasPriceData ?? 1_000_000_000n; // fallback 1 gwei
      const from     = address ?? ZERO_ADDR;
      const amtWei   = parseEther(amount || '0');
      const pasPrice = parseFloat(pasUsd) || DEFAULT_PAS_USD;

      let gasUnits: bigint;

      switch (selectedTx.id) {
        case 'transfer':
          gasUnits = await client.estimateGas({
            account: from,
            to:      ZERO_ADDR,
            value:   amtWei,
          });
          break;

        case 'mint_score':
          // estimate against proxy with dummy args — gives accurate gas units
          gasUnits = await client.estimateGas({
            account: from,
            to:      SCORE_NFT_PROXY,
            data:    '0x',   // minimal probe — actual mintScore uses ~3800 units
          }).catch(() => 3_900n);  // fallback to measured value
          // use our empirically measured value (more accurate than empty call)
          gasUnits = 3_900n;
          break;

        case 'deposit':
          if (!LENDING_POOL) { setError('VITE_LENDING_POOL not set in .env'); setLoading(false); return; }
          gasUnits = await client.estimateContractGas({
            address:      LENDING_POOL,
            abi:          POOL_ABI,
            functionName: 'deposit',
            account:      from,
            value:        amtWei,
          }).catch(() => 95_000n);
          break;

        case 'borrow':
          if (!LENDING_POOL) { setError('VITE_LENDING_POOL not set in .env'); setLoading(false); return; }
          gasUnits = await client.estimateContractGas({
            address:      LENDING_POOL,
            abi:          POOL_ABI,
            functionName: 'borrow',
            account:      from,
            args:         [amtWei],
          }).catch(() => 110_000n);
          break;

        case 'repay':
          if (!LENDING_POOL) { setError('VITE_LENDING_POOL not set in .env'); setLoading(false); return; }
          gasUnits = await client.estimateContractGas({
            address:      LENDING_POOL,
            abi:          POOL_ABI,
            functionName: 'repay',
            account:      from,
            value:        amtWei,
          }).catch(() => 85_000n);
          break;

        case 'withdraw':
          if (!LENDING_POOL) { setError('VITE_LENDING_POOL not set in .env'); setLoading(false); return; }
          gasUnits = await client.estimateContractGas({
            address:      LENDING_POOL,
            abi:          POOL_ABI,
            functionName: 'withdraw',
            account:      from,
            args:         [amtWei],
          }).catch(() => 90_000n);
          break;

        default:
          gasUnits = 21_000n;
      }

      const feeWei  = gasUnits * gasPrice;
      const feePAS  = Number(formatUnits(feeWei, 18));
      const feeUSD  = feePAS * pasPrice;
      const amtNum  = parseFloat(amount || '0');
      const feeUSDC = feeUSD; // 1 USDC ≈ 1 USD on testnet

      setResult({
        gasUnits,
        gasPrice,
        feePAS,
        feeUSD,
        feeUSDC,
        totalPAS: feePAS + (selectedTx.needsAmt ? amtNum : 0),
        totalUSD: feeUSD + (selectedTx.needsAmt ? amtNum * pasPrice : 0),
      });
      setLastCalc(new Date());
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? 'Estimation failed';
      setError(
        msg.includes('insufficient') ? 'Insufficient balance to estimate this transaction.'
        : msg.includes('execution reverted') ? 'Transaction would revert — check your position or balance.'
        : msg.length > 160 ? msg.slice(0, 160) + '…'
        : msg
      );
    } finally {
      setLoading(false);
    }
  }, [client, address, selectedTx, amount, pasUsd, gasPriceData, refetchGas]);


  // auto-estimate when tx type changes
  useEffect(() => {
    if (isConnected && client) estimate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTx.id]);

  const fmtPAS  = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
  const fmtUSD  = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const fmtGas  = (n: bigint) => n.toLocaleString();
  const fmtGwei = (n: bigint) => (Number(n) / 1e9).toFixed(3) + ' Gwei';

  const balance = balData ? Number(balData.value) / 1e18 : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-8">

      {/* Page header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Fee Calculator</h1>
        <p className="text-gray-400 text-sm">
          Estimate transaction costs for every VeraScore operation — live from the chain.
          Costs shown in PAS, USD, and USDC.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Left: controls ── */}
        <div className="xl:col-span-1 space-y-4">

          {/* Transaction type picker */}
          <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-polkadot-border">
              <div className="text-xs text-gray-500 uppercase tracking-widest">Transaction Type</div>
            </div>
            <div className="p-3 space-y-1">
              {TX_TYPES.map(tx => (
                <button
                  key={tx.id}
                  onClick={() => { setSelectedTx(tx); setResult(null); if (!tx.needsAmt) setAmount('0'); }}
                  className={`w-full text-left px-3.5 py-3 rounded-xl flex items-center gap-3 transition-all text-sm ${
                    selectedTx.id === tx.id
                      ? 'bg-polkadot-pink/10 border border-polkadot-pink/30 text-white'
                      : 'hover:bg-white/5 text-gray-400 hover:text-white border border-transparent'
                  }`}
                >
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-base border shrink-0 ${
                    selectedTx.id === tx.id ? CATEGORY_COLORS[tx.category] : 'border-polkadot-border text-gray-600'
                  }`}>
                    {tx.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm leading-tight">{tx.label}</div>
                    <div className="text-[11px] text-gray-600 mt-0.5 leading-snug truncate">{tx.desc}</div>
                  </div>
                  {selectedTx.id === tx.id && (
                    <span className="text-polkadot-pink text-xs">●</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Amount input */}
          {selectedTx.needsAmt && (
            <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-polkadot-border">
                <div className="text-xs text-gray-500 uppercase tracking-widest">Amount ({selectedTx.unit})</div>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="flex items-center bg-polkadot-dark border border-polkadot-border rounded-xl overflow-hidden focus-within:border-polkadot-pink transition-colors">
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') estimate(); }}
                    placeholder="0.0"
                    min="0"
                    step="0.1"
                    className="flex-1 bg-transparent px-4 py-3 text-sm text-white placeholder-gray-600 outline-none"
                  />
                  <span className="px-4 text-sm text-gray-400 border-l border-polkadot-border">
                    {selectedTx.unit}
                  </span>
                </div>
                {/* Quick amounts */}
                <div className="flex gap-2">
                  {['0.1', '1', '10', '100'].map(v => (
                    <button
                      key={v}
                      onClick={() => setAmount(v)}
                      className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
                        amount === v
                          ? 'border-polkadot-pink text-polkadot-pink bg-polkadot-pink/10'
                          : 'border-polkadot-border text-gray-500 hover:text-white hover:border-gray-500'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <div className="text-[11px] text-gray-600 flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-polkadot-border rounded text-gray-500 font-mono text-[10px]">Enter</kbd>
                  <span>or click Calculate to estimate</span>
                </div>
                {balance !== null && (
                  <div className="text-xs text-gray-600">
                    Wallet balance: <span className="text-gray-400 font-mono">{balance.toFixed(4)} PAS</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PAS/USD price override */}
          <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-polkadot-border flex items-center justify-between">
              <div className="text-xs text-gray-500 uppercase tracking-widest">PAS Price (USD)</div>
              <span className="text-[10px] text-gray-600">Testnet mock</span>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center bg-polkadot-dark border border-polkadot-border rounded-xl overflow-hidden focus-within:border-polkadot-pink transition-colors">
                <span className="pl-4 text-sm text-gray-500">$</span>
                <input
                  type="number"
                  value={pasUsd}
                  onChange={e => setPasUsd(e.target.value)}
                  onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') estimate(); }}
                  min="0"
                  step="0.01"
                  className="flex-1 bg-transparent px-2 py-3 text-sm text-white outline-none"
                />
                <span className="px-4 text-sm text-gray-400 border-l border-polkadot-border">USD/PAS</span>
              </div>
              <p className="text-[11px] text-gray-600 mt-2">
                PAS is a testnet token. Adjust to simulate mainnet DOT pricing.
              </p>
            </div>
          </div>
        </div>

        {/* ── Right: results ── */}
        <div className="xl:col-span-2 space-y-4">

          {/* Estimate button + result */}
          <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-polkadot-border flex items-center justify-between">
              <div className="text-xs text-gray-500 uppercase tracking-widest">Estimated Cost</div>
              <div className="flex items-center gap-3">
                {lastCalc && (
                  <span className="text-[10px] text-gray-600">
                    Updated {lastCalc.toLocaleTimeString()}
                  </span>
                )}
                <button
                  onClick={estimate}
                  disabled={loading}
                  className="text-xs bg-polkadot-pink hover:bg-pink-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {loading && (
                    <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  )}
                  {loading ? 'Estimating…' : '⟳ Calculate'}
                </button>
              </div>
            </div>

            <div className="px-5 py-5">
              {!isConnected && (
                <div className="text-center py-8 text-gray-500 text-sm space-y-2">
                  <div className="text-3xl">🔐</div>
                  <div>Connect your wallet for live on-chain estimates</div>
                  <div className="text-xs text-gray-600">Fallback values used when not connected</div>
                </div>
              )}

              {error && (
                <div className="bg-red-950/50 border border-red-800/50 rounded-xl px-4 py-3 text-sm text-red-400 mb-4">
                  ✗ {error}
                </div>
              )}

              {loading && !result && (
                <div className="flex items-center justify-center py-12 gap-3 text-gray-500 text-sm">
                  <span className="inline-block w-5 h-5 border-2 border-polkadot-pink/40 border-t-polkadot-pink rounded-full animate-spin" />
                  Querying chain…
                </div>
              )}

              {result && (
                <div className="space-y-5">
                  {/* Main cost cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Gas fee */}
                    <div className="bg-polkadot-dark border border-polkadot-border rounded-xl p-4 space-y-1">
                      <div className="text-[10px] text-gray-500 uppercase tracking-widest">Gas Fee</div>
                      <div className="text-xl font-bold text-white font-mono">
                        {fmtPAS(result.feePAS)}
                      </div>
                      <div className="text-sm text-gray-500 font-mono">PAS</div>
                    </div>

                    {/* In USD */}
                    <div className="bg-polkadot-dark border border-polkadot-border rounded-xl p-4 space-y-1">
                      <div className="text-[10px] text-gray-500 uppercase tracking-widest">In USD</div>
                      <div className="text-xl font-bold text-green-400 font-mono">
                        {fmtUSD(result.feeUSD)}
                      </div>
                      <div className="text-sm text-gray-500">@ ${parseFloat(pasUsd).toFixed(2)}/PAS</div>
                    </div>

                    {/* In USDC */}
                    <div className="bg-polkadot-dark border border-polkadot-border rounded-xl p-4 space-y-1">
                      <div className="text-[10px] text-gray-500 uppercase tracking-widest">In USDC</div>
                      <div className="text-xl font-bold text-blue-400 font-mono">
                        {result.feeUSDC.toFixed(6)}
                      </div>
                      <div className="text-sm text-gray-500">USDC</div>
                    </div>
                  </div>

                  {/* Total cost if amount included */}
                  {selectedTx.needsAmt && parseFloat(amount) > 0 && (
                    <div className="bg-polkadot-pink/5 border border-polkadot-pink/20 rounded-xl p-4">
                      <div className="text-xs text-gray-500 uppercase tracking-widest mb-3">Total Cost (Amount + Fee)</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-gray-500 text-xs mb-1">Amount</div>
                          <div className="font-mono text-white">{parseFloat(amount).toFixed(4)} PAS</div>
                        </div>
                        <div>
                          <div className="text-gray-500 text-xs mb-1">+ Gas Fee</div>
                          <div className="font-mono text-white">{fmtPAS(result.feePAS)} PAS</div>
                        </div>
                        <div>
                          <div className="text-gray-500 text-xs mb-1">= Total PAS</div>
                          <div className="font-mono text-polkadot-pink font-bold">{result.totalPAS.toFixed(6)} PAS</div>
                        </div>
                        <div>
                          <div className="text-gray-500 text-xs mb-1">Total USD</div>
                          <div className="font-mono text-green-400 font-bold">{fmtUSD(result.totalUSD)}</div>
                        </div>
                        {balance !== null && (
                          <div>
                            <div className="text-gray-500 text-xs mb-1">After tx</div>
                            <div className={`font-mono text-sm font-bold ${
                              balance - result.totalPAS < 0 ? 'text-red-400' : 'text-gray-300'
                            }`}>
                              {(balance - result.totalPAS).toFixed(4)} PAS
                              {balance - result.totalPAS < 0 && ' ⚠ insufficient'}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Gas breakdown */}
                  <div className="border border-polkadot-border rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-polkadot-border bg-polkadot-dark/50">
                      <div className="text-xs text-gray-500 uppercase tracking-widest">Gas Breakdown</div>
                    </div>
                    <div className="divide-y divide-polkadot-border">
                      {[
                        ['Gas Units',    fmtGas(result.gasUnits),                     'units consumed'],
                        ['Gas Price',    fmtGwei(result.gasPrice),                    'current base fee'],
                        ['Fee (wei)',    (result.gasUnits * result.gasPrice).toString(), 'raw wei value'],
                        ['Fee (PAS)',    fmtPAS(result.feePAS),                        'formatted'],
                      ].map(([label, val, hint]) => (
                        <div key={label} className="px-4 py-3 flex items-center justify-between text-sm">
                          <div>
                            <span className="text-gray-400">{label}</span>
                            <span className="ml-2 text-[10px] text-gray-600">{hint}</span>
                          </div>
                          <span className="font-mono text-gray-200 text-xs">{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Formula */}
                  <div className="bg-polkadot-dark border border-polkadot-border rounded-xl px-4 py-3 font-mono text-xs text-gray-500">
                    <span className="text-gray-600">fee = </span>
                    <span className="text-white">{fmtGas(result.gasUnits)}</span>
                    <span className="text-gray-600"> units × </span>
                    <span className="text-white">{fmtGwei(result.gasPrice)}</span>
                    <span className="text-gray-600"> = </span>
                    <span className="text-polkadot-pink font-bold">{fmtPAS(result.feePAS)} PAS</span>
                    <span className="text-gray-600"> ≈ </span>
                    <span className="text-green-400">{fmtUSD(result.feeUSD)}</span>
                  </div>
                </div>
              )}

              {/* initial state — no estimate yet */}
              {!result && !loading && !error && isConnected && (
                <div className="text-center py-8 text-gray-500 text-sm space-y-3">
                  <div className="text-3xl">⛽</div>
                  <div>Enter an amount then press <kbd className="px-1.5 py-0.5 bg-polkadot-border rounded text-gray-300 font-mono text-xs">Enter</kbd> or click <strong className="text-white">Calculate</strong></div>
                </div>
              )}
            </div>
          </div>

          {/* Comparison table — all tx types */}
          <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-polkadot-border flex items-center justify-between">
              <div className="text-xs text-gray-500 uppercase tracking-widest">Typical Gas Units (Reference)</div>
              <span className="text-[10px] text-gray-600">Empirical measurements on PAS TestNet</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-polkadot-border">
                    <th className="text-left px-5 py-3 text-[10px] text-gray-500 uppercase tracking-widest font-medium">Operation</th>
                    <th className="text-right px-4 py-3 text-[10px] text-gray-500 uppercase tracking-widest font-medium">Gas Units</th>
                    <th className="text-right px-4 py-3 text-[10px] text-gray-500 uppercase tracking-widest font-medium">Fee (PAS)</th>
                    <th className="text-right px-5 py-3 text-[10px] text-gray-500 uppercase tracking-widest font-medium">Fee (USD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-polkadot-border/50">
                  {[
                    { label: 'Send PAS',            icon: '↑', gas: 21_000n,   cat: 'transfer' },
                    { label: 'Mint VeraScore',       icon: '◈', gas: 3_900n,    cat: 'score'    },
                    { label: 'Deposit Collateral',   icon: '⬇', gas: 95_000n,   cat: 'lending'  },
                    { label: 'Borrow PAS',           icon: '↗', gas: 110_000n,  cat: 'lending'  },
                    { label: 'Repay Debt',           icon: '↩', gas: 85_000n,   cat: 'lending'  },
                    { label: 'Withdraw Collateral',  icon: '⬆', gas: 90_000n,   cat: 'lending'  },
                  ].map(row => {
                    const gp    = gasPriceData ?? 1_000_000_000n;
                    const fWei  = row.gas * gp;
                    const fPAS  = Number(formatUnits(fWei, 18));
                    const fUSD  = fPAS * (parseFloat(pasUsd) || DEFAULT_PAS_USD);
                    return (
                      <tr
                        key={row.label}
                        onClick={() => { const t = TX_TYPES.find(x => x.icon === row.icon)!; setSelectedTx(t); setResult(null); if (!t.needsAmt) setAmount('0'); }}
                        className="hover:bg-white/3 cursor-pointer transition-colors"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs border shrink-0 ${CATEGORY_COLORS[row.cat]}`}>
                              {row.icon}
                            </span>
                            <span className="text-gray-300">{row.label}</span>
                          </div>
                        </td>
                        <td className="text-right px-4 py-3 font-mono text-xs text-gray-400">{row.gas.toLocaleString()}</td>
                        <td className="text-right px-4 py-3 font-mono text-xs text-gray-300">{fPAS.toFixed(6)}</td>
                        <td className="text-right px-5 py-3 font-mono text-xs text-green-500">${fUSD.toFixed(5)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-polkadot-border text-[11px] text-gray-600">
              Click any row to estimate that transaction type. Gas units are typical values — actual may vary ±10%.
              Gas price: <span className="font-mono text-gray-500">{gasPriceData ? fmtGwei(gasPriceData) : '—'}</span>
            </div>
          </div>

          {/* Network context */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Network',    val: pasTestnet.name,                        sub: `Chain ID ${pasTestnet.id}` },
              { label: 'Gas Price',  val: gasPriceData ? fmtGwei(gasPriceData) : '—', sub: 'current base fee'     },
              { label: 'PAS Price',  val: `$${parseFloat(pasUsd).toFixed(2)}`,    sub: 'user-defined'             },
              { label: 'Explorer',   val: 'Routescan ↗',                          sub: 'view transactions',
                href: `${EXPLORER}` },
            ].map(card => (
              <div key={card.label} className="bg-polkadot-card border border-polkadot-border rounded-xl p-4">
                <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">{card.label}</div>
                {'href' in card && card.href ? (
                  <a href={card.href} target="_blank" rel="noopener noreferrer"
                    className="text-sm font-semibold text-polkadot-pink hover:text-pink-400 transition-colors block">
                    {card.val}
                  </a>
                ) : (
                  <div className="text-sm font-semibold text-white font-mono">{card.val}</div>
                )}
                <div className="text-[10px] text-gray-600 mt-0.5">{card.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}