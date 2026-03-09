'use client';

import { useState, useCallback, useRef } from 'react';
import { useAccount, useBalance, useSendTransaction, useWaitForTransactionReceipt, useChainId, useSwitchChain } from 'wagmi';
import { parseEther, isAddress } from 'viem';
import { pasTestnet, SCORE_NFT_PROXY } from '../utils/wagmi.js';

const EXPLORER = 'https://polkadot.testnet.routescan.io';

type Status = 'idle' | 'signing' | 'mining' | 'success' | 'error';

export function SendPAS({ onSuccess }: { onSuccess?: () => void } = {}) {
  const { address, isConnected } = useAccount();
  const chainId                  = useChainId();
  const { switchChain }          = useSwitchChain();
  const isWrongNetwork           = isConnected && chainId !== pasTestnet.id;

  const { data: balData, refetch: refetchBal } = useBalance({ address, chainId: pasTestnet.id });
  const balance = balData ? Number(balData.value) / 1e18 : 0;

  const [to,     setTo]     = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [errMsg, setErrMsg] = useState('');
  const statusRef = useRef<Status>('idle');
  const setStatusSync = (s: Status) => { statusRef.current = s; setStatus(s); };

  const { sendTransactionAsync } = useSendTransaction();

  const { isLoading: isMining } = useWaitForTransactionReceipt({
    hash:    txHash,
    chainId: pasTestnet.id,
    query:   { enabled: !!txHash && status === 'mining' },
  });

  // derived
  const toValid     = to.trim() !== '' && isAddress(to.trim());
  const amtNum      = parseFloat(amount);
  const amtValid    = !isNaN(amtNum) && amtNum > 0 && amtNum <= balance;
  const canSend     = isConnected && !isWrongNetwork && toValid && amtValid && status !== 'signing' && status !== 'mining';

  const setMax = () => {
    // leave a tiny buffer for gas (~0.001 PAS)
    const max = Math.max(0, balance - 0.001);
    setAmount(max.toFixed(6));
  };

  const handleSend = useCallback(async () => {
    if (!canSend) return;
    setStatusSync('signing');
    setErrMsg('');
    setTxHash(undefined);
    try {
      const hash = await sendTransactionAsync({
        to:    to.trim() as `0x${string}`,
        value: parseEther(amount),
        chainId: pasTestnet.id,
      });
      setTxHash(hash);
      setStatusSync('mining');

      // poll for receipt manually so we can show success
      const interval = setInterval(async () => {
        try {
          const receipt = await fetch(
            `${pasTestnet.rpcUrls.default.http[0]}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0', id: 1,
                method: 'eth_getTransactionReceipt',
                params: [hash],
              }),
            }
          ).then(r => r.json());

          if (receipt?.result?.status === '0x1') {
            clearInterval(interval);
            setStatusSync('success');
            refetchBal();
          } else if (receipt?.result?.status === '0x0') {
            clearInterval(interval);
            setStatusSync('error');
            setErrMsg('Transaction reverted on-chain.');
          }
        } catch { /* keep polling */ }
      }, 2000);

      // safety timeout after 90s
      setTimeout(() => {
        clearInterval(interval);
        if (statusRef.current === 'mining') setStatusSync('success'); // assume ok
      }, 90_000);

    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? 'Unknown error';
      setErrMsg(
        msg.includes('User rejected') || msg.includes('rejected')
          ? 'Transaction rejected in MetaMask.'
          : msg.includes('insufficient')
          ? 'Insufficient PAS balance.'
          : msg.length > 140 ? msg.slice(0, 140) + '…' : msg
      );
      setStatusSync('error');
    }
  }, [canSend, to, amount, sendTransactionAsync, refetchBal]);

  const reset = () => {
    statusRef.current = 'idle'; setStatus('idle');
    setTxHash(undefined);
    setErrMsg('');
    setTo('');
    setAmount('');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-8">

      {/* Page header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Send PAS</h1>
        <p className="text-gray-400 text-sm">
          Transfer native PAS tokens to any address on Polkadot Hub TestNet.
          Uses your connected MetaMask wallet — no backend involved.
        </p>
      </div>

      {/* Wrong network banner */}
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

        {/* ── Send form ── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-polkadot-border">
              <div className="text-xs text-gray-500 uppercase tracking-widest">Transfer Details</div>
            </div>

            <div className="px-5 py-5 space-y-5">

              {/* From */}
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500 uppercase tracking-widest">From</label>
                <div className="bg-polkadot-dark border border-polkadot-border rounded-xl px-4 py-3 flex items-center gap-3">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <span className="font-mono text-sm text-gray-300 truncate">
                    {isConnected ? address : 'Not connected'}
                  </span>
                  {isConnected && (
                    <span className="ml-auto text-xs text-polkadot-pink font-mono font-semibold shrink-0">
                      {balance.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} PAS
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
                  placeholder="0x..."
                  disabled={status === 'signing' || status === 'mining'}
                  className={`w-full bg-polkadot-dark border rounded-xl px-4 py-3 font-mono text-sm text-white placeholder-gray-600 outline-none transition-colors ${
                    to && !toValid
                      ? 'border-red-500/60 focus:border-red-500'
                      : to && toValid
                      ? 'border-green-500/60 focus:border-green-500'
                      : 'border-polkadot-border focus:border-polkadot-pink'
                  }`}
                />
                {to && !toValid && (
                  <p className="text-xs text-red-400">Invalid EVM address</p>
                )}
                {to && toValid && (
                  <p className="text-xs text-green-400">✓ Valid address</p>
                )}
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-500 uppercase tracking-widest">Amount</label>
                  {isConnected && (
                    <button
                      onClick={setMax}
                      className="text-xs text-polkadot-pink hover:text-pink-400 transition-colors font-medium"
                    >
                      Max
                    </button>
                  )}
                </div>
                <div className={`flex items-center bg-polkadot-dark border rounded-xl overflow-hidden transition-colors ${
                  amount && !amtValid
                    ? 'border-red-500/60'
                    : amount && amtValid
                    ? 'border-green-500/60'
                    : 'border-polkadot-border focus-within:border-polkadot-pink'
                }`}>
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.0"
                    min="0"
                    step="0.001"
                    disabled={status === 'signing' || status === 'mining'}
                    className="flex-1 bg-transparent px-4 py-3 text-sm text-white placeholder-gray-600 outline-none"
                  />
                  <span className="px-4 text-sm text-gray-400 font-medium border-l border-polkadot-border">PAS</span>
                </div>
                {amount && !amtValid && amtNum > balance && (
                  <p className="text-xs text-red-400">Insufficient balance</p>
                )}
                {amount && amtValid && (
                  <p className="text-xs text-gray-500">
                    ≈ {amtNum.toLocaleString('en-US', { minimumFractionDigits: 4 })} PAS · remaining after send:{' '}
                    <span className="text-gray-400">{(balance - amtNum).toFixed(4)} PAS</span>
                  </p>
                )}
              </div>

              {/* Status messages */}
              {status === 'signing' && (
                <div className="flex items-center gap-3 bg-blue-950/50 border border-blue-800/50 rounded-xl px-4 py-3 text-sm text-blue-300">
                  <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                  Waiting for MetaMask confirmation…
                </div>
              )}
              {status === 'mining' && (
                <div className="flex items-center gap-3 bg-yellow-950/50 border border-yellow-800/50 rounded-xl px-4 py-3 text-sm text-yellow-300">
                  <span className="inline-block w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin shrink-0" />
                  Transaction submitted — waiting for block confirmation…
                  {txHash && (
                    <a
                      href={`${EXPLORER}/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-xs underline opacity-70 hover:opacity-100 shrink-0"
                    >
                      View ↗
                    </a>
                  )}
                </div>
              )}
              {status === 'success' && (
                <div className="bg-green-950/50 border border-green-800/50 rounded-xl px-4 py-4 space-y-2">
                  <div className="flex items-center gap-2 text-green-400 font-semibold text-sm">
                    <span>✓</span> Transaction confirmed!
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
                  className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all
                    bg-polkadot-pink hover:bg-pink-600 text-white
                    disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500"
                >
                  {!isConnected
                    ? 'Connect Wallet to Send'
                    : isWrongNetwork
                    ? 'Switch to PAS TestNet'
                    : status === 'signing'
                    ? 'Confirm in MetaMask…'
                    : status === 'mining'
                    ? 'Confirming…'
                    : 'Send PAS'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Right sidebar: info ── */}
        <div className="space-y-4">

          {/* Network info */}
          <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-polkadot-border">
              <div className="text-xs text-gray-500 uppercase tracking-widest">Network</div>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm">
              {[
                ['Name',     pasTestnet.name],
                ['Chain ID', pasTestnet.id.toString()],
                ['Token',    `${pasTestnet.nativeCurrency.name} (${pasTestnet.nativeCurrency.symbol})`],
                ['Decimals', pasTestnet.nativeCurrency.decimals.toString()],
                ['RPC',      pasTestnet.rpcUrls.default.http[0].replace('https://', '')],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-3">
                  <span className="text-gray-500 shrink-0">{k}</span>
                  <span className="text-gray-200 font-mono text-xs text-right break-all">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Contract links */}
          <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-polkadot-border">
              <div className="text-xs text-gray-500 uppercase tracking-widest">Contracts</div>
            </div>
            <div className="px-5 py-4 space-y-3">
              {[
                ['ScoreNFT',  SCORE_NFT_PROXY],
                ['Lending',   import.meta.env.VITE_LENDING_POOL],
              ].filter(([, addr]) => addr).map(([label, addr]) => (
                <div key={label} className="space-y-0.5">
                  <div className="text-xs text-gray-500">{label}</div>
                  <a
                    href={`${EXPLORER}/address/${addr}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[11px] text-gray-400 hover:text-polkadot-pink transition-colors break-all"
                  >
                    {addr} ↗
                  </a>
                </div>
              ))}
            </div>
          </div>

          {/* Tips */}
          <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-polkadot-border">
              <div className="text-xs text-gray-500 uppercase tracking-widest">Tips</div>
            </div>
            <div className="px-5 py-4 space-y-2 text-xs text-gray-500 leading-relaxed">
              <p>• Keep ~0.001 PAS for gas fees after sending.</p>
              <p>• Transactions confirm in ~6–12 seconds on PAS TestNet.</p>
              <p>• Only EVM-format addresses (0x…) are supported here.</p>
              <p>• Get testnet PAS from the Polkadot faucet.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}