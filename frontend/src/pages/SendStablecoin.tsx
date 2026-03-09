'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAccount, useWriteContract, useChainId, useSwitchChain } from 'wagmi';
import { isAddress, parseUnits, getAddress }        from 'viem';
import { pasTestnet, USDT_ERC20, USDC_ERC20 }       from '../utils/wagmi.js';

const EXPLORER = 'https://polkadot.testnet.routescan.io';
const RPC_URL  = 'https://services.polkadothub-rpc.com/testnet';

const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs:  [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

type Token  = 'USDT' | 'USDC';
type Status = 'idle' | 'signing' | 'mining' | 'success' | 'error';

const TOKEN_CONFIG: Record<Token, {
  address:  `0x${string}`;
  assetId:  number;
  decimals: number;
  color:    string;
  bg:       string;
  border:   string;
  dot:      string;
  explorer: string;
}> = {
  USDT: {
    address:  getAddress(USDT_ERC20),
    assetId:  1984,
    decimals: 6,
    color:    'text-emerald-400',
    bg:       'bg-emerald-950/40',
    border:   'border-emerald-700/40',
    dot:      'bg-emerald-400',
    explorer: `${EXPLORER}/token/0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF07C0`,
  },
  USDC: {
    address:  getAddress(USDC_ERC20),
    assetId:  1337,
    decimals: 6,
    color:    'text-blue-400',
    bg:       'bg-blue-950/40',
    border:   'border-blue-700/40',
    dot:      'bg-blue-400',
    explorer: `${EXPLORER}/token/0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0539`,
  },
};

// ── Poll receipt until confirmed/reverted ─────────────────────────────────────
async function pollReceipt(hash: string): Promise<'confirmed' | 'reverted'> {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3_000));
    try {
      const res  = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'eth_getTransactionReceipt',
          params: [hash],
        }),
        signal: AbortSignal.timeout(8_000),
      });
      const json = await res.json() as {
        result?: { blockNumber?: string; status?: string } | null;
      };
      console.log(`[SendStablecoin] poll #${i + 1}:`, json.result
        ? `block=${json.result.blockNumber} status=${json.result.status}`
        : 'null');
      if (json.result?.blockNumber) {
        return json.result.status === '0x1' ? 'confirmed' : 'reverted';
      }
    } catch (e) {
      console.warn(`[SendStablecoin] poll #${i + 1} error:`, e);
    }
  }
  console.warn('[SendStablecoin] poll timeout — assuming confirmed');
  return 'confirmed';
}

// ── Fetch USDT/USDC from /balances endpoint (Sidecar REST → PAPI fallback) ────
async function fetchStableBalances(
  address: string,
): Promise<{ usdt: number; usdc: number }> {
  console.log('[SendStablecoin] fetchStableBalances →', address);
  try {
    const res  = await fetch(`/balances/${address}`);
    const json = await res.json() as {
      success: boolean;
      usdt:    number;
      usdc:    number;
      source?: string;
      error?:  string;
    };
    console.log(`[SendStablecoin] /balances → success=${json.success} usdt=${json.usdt} usdc=${json.usdc} source=${json.source ?? 'n/a'}`);
    if (!json.success) {
      console.warn('[SendStablecoin] balance fetch failed:', json.error);
      return { usdt: 0, usdc: 0 };
    }
    return { usdt: json.usdt, usdc: json.usdc };
  } catch (e) {
    console.error('[SendStablecoin] fetchStableBalances error:', e);
    return { usdt: 0, usdc: 0 };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export function SendStablecoin() {
  const { address, isConnected } = useAccount();
  const chainId                  = useChainId();
  const { switchChain }          = useSwitchChain();
  const isWrongNetwork           = isConnected && chainId !== pasTestnet.id;

  const [token,      setToken]      = useState<Token>('USDT');
  const [to,         setTo]         = useState('');
  const [amount,     setAmount]     = useState('');
  const [status,     setStatus]     = useState<Status>('idle');
  const [txHash,     setTxHash]     = useState<`0x${string}` | undefined>();
  const [errMsg,     setErrMsg]     = useState('');
  const [balances,   setBalances]   = useState<{ usdt: number; usdc: number } | null>(null);
  const [balLoading, setBalLoading] = useState(false);

  const statusRef  = useRef<Status>('idle');
  const pauseUntil = useRef<number>(0);

  const cfg     = TOKEN_CONFIG[token];
  const balance = balances !== null
    ? (token === 'USDT' ? balances.usdt : balances.usdc)
    : null;

  // ── Fetch balances on mount / address change ────────────────────────────────
  useEffect(() => {
    if (!isConnected || !address) {
      setBalances(null);
      return;
    }

    let cancelled = false;

    const doFetch = (label: string) => {
      if (Date.now() < pauseUntil.current) {
        console.log(
          `[SendStablecoin] ${label} skipped — pause active for`,
          Math.ceil((pauseUntil.current - Date.now()) / 1000), 's',
        );
        return;
      }
      console.log(`[SendStablecoin] ${label}: fetching...`);
      fetchStableBalances(address).then(b => {
        if (cancelled) return;
        console.log(`[SendStablecoin] ${label}: result =`, b);
        setBalances(b);
        setBalLoading(false);
      });
    };

    setBalLoading(true);
    doFetch('initial');
    const iv = setInterval(() => doFetch('interval'), 15_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [address, isConnected]);

  // ── Token tab switch ────────────────────────────────────────────────────────
  const handleTokenSwitch = (t: Token) => {
    setToken(t);
    setAmount('');
    setTo('');
    statusRef.current = 'idle';
    setStatus('idle');
    setErrMsg('');
    setTxHash(undefined);
  };

  // ── Validation ──────────────────────────────────────────────────────────────
  const toValid         = to.trim() !== '' && isAddress(to.trim());
  const amtNum          = parseFloat(amount);
  const amtValid        = !isNaN(amtNum) && amtNum > 0;
  const amtInsufficient = balance !== null && amtValid && amtNum > balance;
  const canSend         = isConnected
    && !isWrongNetwork
    && toValid
    && amtValid
    && !amtInsufficient
    && balance !== null
    && statusRef.current !== 'signing'
    && statusRef.current !== 'mining';

  const setMax = () => {
    if (balance !== null && balance > 0) setAmount(balance.toFixed(6));
  };

  // ── Write contract ──────────────────────────────────────────────────────────
  const { writeContractAsync } = useWriteContract();

  const handleSend = useCallback(async () => {
    if (!canSend || !address) return;

    console.log('[SendStablecoin] handleSend — token:', token, 'to:', to, 'amount:', amount, 'balance:', balance);
    statusRef.current = 'signing';
    setStatus('signing');
    setErrMsg('');
    setTxHash(undefined);

    try {
      console.log('[SendStablecoin] writeContractAsync on precompile:', cfg.address);
      const hash = await writeContractAsync({
        address:      cfg.address,
        abi:          ERC20_ABI,
        functionName: 'transfer',
        args:         [to.trim() as `0x${string}`, parseUnits(amount, cfg.decimals)],
        chainId:      pasTestnet.id,
      });

      console.log('[SendStablecoin] tx hash:', hash);
      setTxHash(hash);
      statusRef.current = 'mining';
      setStatus('mining');

      console.log('[SendStablecoin] polling receipt...');
      const result = await pollReceipt(hash);
      console.log('[SendStablecoin] receipt result:', result);

      if (result === 'confirmed') {
        statusRef.current = 'success';
        setStatus('success');

        // Optimistic balance update immediately
        const sent = parseFloat(amount);
        console.log('[SendStablecoin] optimistic update — sent:', sent, 'prev:', balances);
        pauseUntil.current = Date.now() + 30_000;
        setBalances(prev => {
          if (!prev) return prev;
          return {
            usdt: token === 'USDT' ? Math.max(0, prev.usdt - sent) : prev.usdt,
            usdc: token === 'USDC' ? Math.max(0, prev.usdc - sent) : prev.usdc,
          };
        });

        // Real refetch after 12s (Substrate propagation delay)
        setTimeout(() => {
          console.log('[SendStablecoin] 12s elapsed — refetching from backend...');
          fetchStableBalances(address).then(b => {
            console.log('[SendStablecoin] post-tx balance from backend:', b);
            pauseUntil.current = 0;
            setBalances(b);
          });
        }, 12_000);

      } else {
        statusRef.current = 'error';
        setStatus('error');
        setErrMsg('Transaction reverted on-chain. Check your balance and try again.');
      }

    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? 'Unknown error';
      setErrMsg(
        msg.includes('User rejected') || msg.includes('rejected')
          ? 'Transaction rejected in MetaMask.'
          : msg.includes('insufficient') || msg.includes('balance')
          ? `Insufficient ${token} balance.`
          : msg.length > 160
          ? msg.slice(0, 160) + '…'
          : msg,
      );
      statusRef.current = 'error';
      setStatus('error');
    }
  }, [canSend, address, cfg, to, amount, token, balance, balances, writeContractAsync]);

  // ── Reset ───────────────────────────────────────────────────────────────────
  const reset = () => {
    statusRef.current = 'idle';
    setStatus('idle');
    setTxHash(undefined);
    setErrMsg('');
    setTo('');
    setAmount('');
    if (address) {
      pauseUntil.current = 0;
      console.log('[SendStablecoin] reset — force refetch...');
      fetchStableBalances(address).then(b => {
        console.log('[SendStablecoin] reset balance:', b);
        setBalances(b);
      });
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-8">

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Send Stablecoins</h1>
        <p className="text-gray-400 text-sm">
          Transfer USDT or USDC on Polkadot Hub TestNet via native Assets pallet ERC-20 precompile.
          Gas is paid in PAS — no bridging required.
        </p>
      </div>

      {/* Wrong network */}
      {isWrongNetwork && (
        <div className="flex items-center justify-between bg-yellow-900/40 border border-yellow-500/50 rounded-xl px-5 py-3 text-sm">
          <span className="text-yellow-300 font-medium">
            ⚠️ Wrong network — switch to <strong>Polkadot Hub TestNet</strong>
          </span>
          <button
            onClick={() => switchChain({ chainId: pasTestnet.id })}
            className="ml-4 shrink-0 bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-4 py-1.5 rounded-lg text-xs transition"
          >
            Switch Network
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left: form ──────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">

            {/* Token tabs */}
            <div className="px-5 pt-5 pb-0 flex gap-2">
              {(['USDT', 'USDC'] as Token[]).map(t => {
                const c = TOKEN_CONFIG[t];
                return (
                  <button
                    key={t}
                    onClick={() => handleTokenSwitch(t)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                      token === t
                        ? `${c.bg} ${c.border} ${c.color}`
                        : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                    {t}
                  </button>
                );
              })}
            </div>

            <div className="px-5 py-5 space-y-5">

              {/* From */}
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500 uppercase tracking-widest">From</label>
                <div className="bg-polkadot-dark border border-polkadot-border rounded-xl px-4 py-3 flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? cfg.dot : 'bg-gray-600'}`} />
                  <span className="font-mono text-sm text-gray-300 truncate flex-1">
                    {isConnected ? address : 'Not connected'}
                  </span>
                  {isConnected && (
                    <span className={`text-xs font-mono font-semibold shrink-0 ${
                      balance !== null && balance > 0 ? cfg.color : 'text-gray-500'
                    }`}>
                      {balLoading && balance === null
                        ? 'Loading…'
                        : balance !== null
                        ? `${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${token}`
                        : `0.00 ${token}`}
                    </span>
                  )}
                </div>
              </div>

              {/* Arrow */}
              <div className="flex justify-center">
                <div className="w-8 h-8 rounded-full border border-polkadot-border bg-polkadot-dark flex items-center justify-center text-gray-500">
                  ↓
                </div>
              </div>

              {/* To address */}
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500 uppercase tracking-widest">To Address</label>
                <input
                  type="text"
                  value={to}
                  onChange={e => setTo(e.target.value)}
                  placeholder="0x…"
                  spellCheck={false}
                  disabled={status === 'signing' || status === 'mining'}
                  className={`w-full bg-polkadot-dark border rounded-xl px-4 py-3 text-sm font-mono
                    placeholder-gray-600 outline-none transition-colors ${
                    to && !toValid
                      ? 'border-red-500/60 text-red-400'
                      : to && toValid
                      ? 'border-green-500/60 text-gray-200'
                      : 'border-polkadot-border text-gray-200 focus:border-polkadot-pink/60'
                  }`}
                />
                {to && !toValid && (
                  <p className="text-xs text-red-400">Invalid EVM address</p>
                )}
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-500 uppercase tracking-widest">Amount</label>
                  {isConnected && balance !== null && balance > 0 && (
                    <button
                      onClick={setMax}
                      className={`text-xs font-medium transition-colors hover:opacity-80 ${cfg.color}`}
                    >
                      Max
                    </button>
                  )}
                </div>
                <div className={`flex items-center bg-polkadot-dark border rounded-xl overflow-hidden transition-colors ${
                  amtInsufficient
                    ? 'border-red-500/60'
                    : amount && amtValid
                    ? 'border-green-500/60'
                    : 'border-polkadot-border focus-within:border-polkadot-pink/60'
                }`}>
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    disabled={status === 'signing' || status === 'mining'}
                    className="flex-1 bg-transparent px-4 py-3 text-sm text-white placeholder-gray-600 outline-none"
                  />
                  <span className={`px-4 text-sm font-semibold border-l border-polkadot-border ${cfg.color}`}>
                    {token}
                  </span>
                </div>
                {amtInsufficient && (
                  <p className="text-xs text-red-400">Insufficient {token} balance</p>
                )}
                {amount && amtValid && !amtInsufficient && balance !== null && (
                  <p className="text-xs text-gray-500">
                    Remaining:{' '}
                    <span className="text-gray-400">{(balance - amtNum).toFixed(6)} {token}</span>
                  </p>
                )}
              </div>

              {/* Status banners */}
              {status === 'signing' && (
                <div className="flex items-center gap-3 bg-blue-950/50 border border-blue-800/50 rounded-xl px-4 py-3 text-sm text-blue-300">
                  <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                  Waiting for MetaMask confirmation…
                </div>
              )}

              {status === 'mining' && (
                <div className="flex items-center gap-3 bg-yellow-950/50 border border-yellow-800/50 rounded-xl px-4 py-3 text-sm text-yellow-300">
                  <span className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span className="flex-1">Transaction submitted — waiting for block…</span>
                  {txHash && (
                    <a
                      href={`${EXPLORER}/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline opacity-70 hover:opacity-100 shrink-0"
                    >
                      View ↗
                    </a>
                  )}
                </div>
              )}

              {status === 'success' && (
                <div className="bg-green-950/50 border border-green-800/50 rounded-xl px-4 py-4 space-y-2">
                  <div className="flex items-center gap-2 text-green-400 font-semibold text-sm">
                    <span>✓</span> {token} sent successfully!
                  </div>
                  {txHash && (
                    <a
                      href={`${EXPLORER}/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block font-mono text-xs text-green-600 hover:text-green-400 truncate transition-colors"
                    >
                      {txHash} ↗
                    </a>
                  )}
                  <button
                    onClick={reset}
                    className="mt-1 text-xs text-gray-400 hover:text-white underline transition-colors"
                  >
                    Send another
                  </button>
                </div>
              )}

              {status === 'error' && (
                <div className="bg-red-950/50 border border-red-800/50 rounded-xl px-4 py-3 text-sm text-red-400">
                  ✗ {errMsg}
                </div>
              )}

              {/* Send button */}
              {status !== 'success' && (
                <button
                  onClick={handleSend}
                  disabled={!canSend}
                  className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all
                    disabled:opacity-40 disabled:cursor-not-allowed
                    ${token === 'USDT'
                      ? 'bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700'
                      : 'bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700'
                    } text-white disabled:text-gray-500`}
                >
                  {!isConnected
                    ? 'Connect Wallet to Send'
                    : isWrongNetwork
                    ? 'Switch to PAS TestNet'
                    : status === 'signing'
                    ? 'Confirm in MetaMask…'
                    : status === 'mining'
                    ? 'Confirming…'
                    : `Send ${token}`}
                </button>
              )}

            </div>
          </div>
        </div>

        {/* ── Right: info ─────────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* How it works */}
          <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-polkadot-border">
              <div className="text-xs text-gray-500 uppercase tracking-widest">How It Works</div>
            </div>
            <div className="px-5 py-4 space-y-3 text-xs text-gray-400 leading-relaxed">
              <p>
                USDT and USDC on Polkadot Hub are{' '}
                <span className="text-gray-200 font-medium">native Assets pallet tokens</span>.
                Polkadot Hub exposes them via ERC-20 precompile addresses so MetaMask can send them directly.
              </p>
              <p>
                Gas is always paid in{' '}
                <span className="text-gray-200 font-medium">PAS</span> — never ETH.
                This is a core advantage of building on Polkadot Hub.
              </p>
              <p>
                Balances are queried via{' '}
                <span className="text-gray-200 font-medium">PAPI (Substrate)</span> — the same source as the Score page.
              </p>
            </div>
          </div>

          {/* Asset info */}
          <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-polkadot-border">
              <div className="text-xs text-gray-500 uppercase tracking-widest">Asset Info</div>
            </div>
            <div className="px-5 py-4 space-y-4">
              {(['USDT', 'USDC'] as Token[]).map(t => {
                const c = TOKEN_CONFIG[t];
                return (
                  <div key={t} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                      <span className={`text-xs font-semibold ${c.color}`}>{t}</span>
                      <span className="text-gray-600 text-xs">Asset ID {c.assetId}</span>
                    </div>
                    <a
                      href={c.explorer}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block font-mono text-[10px] text-gray-600 hover:text-gray-400 break-all transition-colors"
                    >
                      {c.address} ↗
                    </a>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Your balances */}
          {isConnected && (
            <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-polkadot-border flex items-center justify-between">
                <div className="text-xs text-gray-500 uppercase tracking-widest">Your Balances</div>
                {balLoading && (
                  <span className="w-3 h-3 border border-gray-600 border-t-transparent rounded-full animate-spin" />
                )}
              </div>
              <div className="px-5 py-4 space-y-3">
                {(['USDT', 'USDC'] as Token[]).map(t => {
                  const c = TOKEN_CONFIG[t];
                  const b = balances !== null
                    ? (t === 'USDT' ? balances.usdt : balances.usdc)
                    : null;
                  return (
                    <div key={t} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                        <span className="text-xs text-gray-400">{t}</span>
                      </div>
                      <span className={`text-xs font-mono font-semibold ${
                        b !== null && b > 0 ? c.color : 'text-gray-500'
                      }`}>
                        {b !== null
                          ? b.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
                          : balLoading ? '…' : '0.00'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tips */}
          <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-polkadot-border">
              <div className="text-xs text-gray-500 uppercase tracking-widest">Tips</div>
            </div>
            <div className="px-5 py-4 space-y-2 text-xs text-gray-500 leading-relaxed">
              <p>• Keep ~0.001 PAS for gas fees.</p>
              <p>• USDT = asset 1984, USDC = asset 1337 on Polkadot Hub.</p>
              <p>• Transactions confirm in ~6–12 seconds.</p>
              <p>• Only EVM-format (0x…) addresses supported here.</p>
              <p>• USDC is not deployed on PAS TestNet.</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}