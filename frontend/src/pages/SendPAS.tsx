import { useState, useCallback, useEffect } from 'react';
import {
  useAccount, useBalance, useSendTransaction,
  useWaitForTransactionReceipt, useChainId, useSwitchChain,
} from 'wagmi';
import { parseEther, isAddress } from 'viem';
import { pasTestnet, SCORE_NFT_PROXY } from '../utils/wagmi';

const EXPLORER = 'https://polkadot.testnet.routescan.io';

type Status = 'idle' | 'signing' | 'mining' | 'success' | 'error';

export function SendPAS({ onSuccess }: { onSuccess?: () => void } = {}) {
  const { address, isConnected } = useAccount();
  const chainId                  = useChainId();
  const { switchChain }          = useSwitchChain();
  const isWrongNetwork           = isConnected && chainId !== pasTestnet.id;

  const { data: balData, refetch: refetchBal } = useBalance({
    address, chainId: pasTestnet.id, query: { refetchInterval: 10_000 },
  });
  const balance = balData ? Number(balData.value) / 1e18 : 0;

  const [to,     setTo]     = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [errMsg, setErrMsg] = useState('');

  const { sendTransactionAsync } = useSendTransaction();
  const { isSuccess: isConfirmed, isError: isFailed, error: receiptError } =
    useWaitForTransactionReceipt({
      hash: txHash, chainId: pasTestnet.id,
      query: { enabled: !!txHash && status === 'mining' },
    });

  useEffect(() => {
    if (isConfirmed && status === 'mining') { setStatus('success'); refetchBal(); onSuccess?.(); }
  }, [isConfirmed, status, refetchBal, onSuccess]);

  useEffect(() => {
    if (isFailed && status === 'mining') {
      setStatus('error');
      const msg = receiptError?.message ?? 'Transaction failed on-chain.';
      setErrMsg(msg.length > 140 ? msg.slice(0, 140) + '…' : msg);
    }
  }, [isFailed, status, receiptError]);

  const toValid  = to.trim() !== '' && isAddress(to.trim());
  const amtNum   = parseFloat(amount);
  const amtValid = !isNaN(amtNum) && amtNum > 0 && amtNum <= balance;
  const canSend  = isConnected && !isWrongNetwork && toValid && amtValid && status === 'idle';

  const setMax = () => setAmount(Math.max(0, balance - 0.001).toFixed(6));

  const handleSend = useCallback(async () => {
    if (!canSend) return;
    setStatus('signing'); setErrMsg(''); setTxHash(undefined);
    try {
      const hash = await sendTransactionAsync({
        to: to.trim() as `0x${string}`, value: parseEther(amount), chainId: pasTestnet.id,
      });
      setTxHash(hash); setStatus('mining');
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? 'Unknown error';
      setErrMsg(
        msg.includes('User rejected') || msg.includes('rejected') ? 'Transaction rejected in MetaMask.'
        : msg.includes('insufficient') ? 'Insufficient PAS balance for gas.'
        : msg.length > 140 ? msg.slice(0, 140) + '…' : msg,
      );
      setStatus('error');
    }
  }, [canSend, to, amount, sendTransactionAsync]);

  const reset = () => { setStatus('idle'); setTxHash(undefined); setErrMsg(''); setTo(''); setAmount(''); };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-black tracking-tight text-white">
          Send <span className="text-polkadot-pink">PAS</span>
        </h1>
        <p className="text-[10px] text-gray-600 mt-0.5 font-medium">
          Native token transfer · Polkadot Hub TestNet
        </p>
      </div>

      {/* Wrong network */}
      {isWrongNetwork && (
        <div className="flex items-center justify-between bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-4 py-3">
          <span className="text-xs font-semibold text-yellow-400">⚠ Switch to Polkadot Hub TestNet</span>
          <button onClick={() => switchChain({ chainId: pasTestnet.id })}
            className="shrink-0 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 font-bold text-xs px-3 py-1.5 rounded-lg transition-all ml-3">
            Switch
          </button>
        </div>
      )}

      {/* Send form */}
      <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden shadow-xl">
        <div className="px-4 py-3 border-b border-polkadot-border bg-black/20 flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Transfer Details</span>
          {isConnected && (
            <span className="text-[9px] font-black font-mono text-polkadot-pink">
              {balance.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} PAS
            </span>
          )}
        </div>

        <div className="px-4 py-4 space-y-4">

          {/* From */}
          <div className="space-y-1.5">
            <div className="text-[8px] font-bold uppercase tracking-widest text-gray-700">From</div>
            <div className="bg-black/30 border border-white/5 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isConnected ? 'bg-emerald-500' : 'bg-gray-700'}`} />
              <span className="font-mono text-xs text-gray-500 truncate flex-1">
                {isConnected ? address : 'Not connected'}
              </span>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <div className="w-7 h-7 rounded-lg border border-polkadot-border bg-black/30 flex items-center justify-center text-polkadot-pink text-xs font-black">
              ↓
            </div>
          </div>

          {/* To */}
          <div className="space-y-1.5">
            <div className="text-[8px] font-bold uppercase tracking-widest text-gray-700">To Address</div>
            <input type="text" value={to} onChange={e => setTo(e.target.value)}
              placeholder="0x…"
              disabled={status === 'signing' || status === 'mining'}
              className={`w-full bg-polkadot-dark border rounded-xl px-4 py-2.5 text-xs font-mono text-white placeholder-gray-700 outline-none transition-colors ${
                to && !toValid  ? 'border-red-500/40'
                : to && toValid ? 'border-emerald-500/30'
                :                 'border-polkadot-border focus:border-polkadot-pink/40'
              }`}
            />
            {to && !toValid && (
              <p className="text-[9px] font-bold text-red-400">✗ Invalid EVM address</p>
            )}
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="text-[8px] font-bold uppercase tracking-widest text-gray-700">Amount</div>
              {isConnected && (
                <button onClick={setMax}
                  className="text-[9px] font-bold uppercase tracking-widest text-polkadot-pink hover:opacity-70 transition-opacity">
                  Max
                </button>
              )}
            </div>
            <div className={`flex items-center bg-polkadot-dark border rounded-xl overflow-hidden transition-colors ${
              amount && !amtValid  ? 'border-red-500/40'
              : amount && amtValid ? 'border-emerald-500/30'
              :                      'border-polkadot-border focus-within:border-polkadot-pink/40'
            }`}>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0.0" min="0" step="0.001"
                disabled={status === 'signing' || status === 'mining'}
                className="flex-1 bg-transparent px-4 py-2.5 text-sm font-mono text-white placeholder-gray-700 outline-none"
              />
              <span className="px-4 text-[9px] font-black uppercase tracking-widest text-gray-700 border-l border-polkadot-border">
                PAS
              </span>
            </div>
            {amount && !amtValid && amtNum > balance && (
              <p className="text-[9px] font-bold text-red-400">✗ Insufficient balance</p>
            )}
            {amount && amtValid && (
              <p className="text-[9px] text-gray-700">
                Remaining: <span className="text-gray-600">{(balance - amtNum).toFixed(4)} PAS</span>
              </p>
            )}
          </div>

          {/* Status banners */}
          {status === 'signing' && (
            <div className="flex items-center gap-2.5 bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-4 py-2.5">
              <span className="w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-yellow-400">Check MetaMask…</span>
            </div>
          )}
          {status === 'mining' && (
            <div className="flex items-center gap-2.5 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-2.5">
              <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-blue-400 flex-1">Mining on Hub…</span>
              {txHash && (
                <a href={`${EXPLORER}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                  className="text-[9px] font-bold uppercase text-gray-600 hover:text-polkadot-pink transition-colors shrink-0">
                  View ↗
                </a>
              )}
            </div>
          )}
          {status === 'success' && (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3 space-y-1.5">
              <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-400">✓ Confirmed</div>
              {txHash && (
                <a href={`${EXPLORER}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                  className="block font-mono text-[9px] text-gray-600 hover:text-polkadot-pink truncate transition-colors">
                  {txHash} ↗
                </a>
              )}
              <button onClick={reset}
                className="text-[9px] font-bold uppercase tracking-widest text-gray-600 hover:text-gray-400 transition-colors">
                Send Another →
              </button>
            </div>
          )}
          {status === 'error' && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3 space-y-1.5">
              <div className="text-[9px] font-bold uppercase tracking-widest text-red-400">✗ {errMsg}</div>
              <button onClick={reset}
                className="text-[9px] font-bold uppercase tracking-widest text-gray-600 hover:text-gray-400 transition-colors">
                Try Again →
              </button>
            </div>
          )}

          {/* Send button */}
          {status !== 'success' && (
            <button onClick={handleSend} disabled={!canSend}
              className="w-full py-3 bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_12px_rgba(230,0,122,0.2)]">
              {!isConnected          ? 'Connect Wallet to Send'
              : isWrongNetwork       ? 'Switch to PAS TestNet'
              : status === 'signing' ? 'Confirm in MetaMask…'
              : status === 'mining'  ? 'Confirming On-Chain…'
              : 'Send PAS'}
            </button>
          )}
        </div>
      </div>

      {/* Info row — network + tips side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* Network */}
        <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-polkadot-border bg-black/20">
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Network</span>
          </div>
          <div className="grid grid-cols-1 gap-px bg-polkadot-border">
            {([
              ['Name',     pasTestnet.name],
              ['Chain ID', pasTestnet.id.toString()],
              ['Token',    `${pasTestnet.nativeCurrency.name} (${pasTestnet.nativeCurrency.symbol})`],
              ['Decimals', pasTestnet.nativeCurrency.decimals.toString()],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="bg-polkadot-card px-4 py-2.5 flex justify-between items-center gap-3">
                <span className="text-[8px] font-bold uppercase tracking-widest text-gray-700 shrink-0">{k}</span>
                <span className="text-[9px] font-mono text-gray-500 text-right break-all">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tips + contracts */}
        <div className="space-y-3">
          <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-polkadot-border bg-black/20">
              <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Tips</span>
            </div>
            <div className="px-4 py-3 space-y-2">
              {[
                'Keep ~0.001 PAS for gas.',
                'Confirms in ~6–12 s on PAS TestNet.',
                'EVM-format addresses only (0x…).',
              ].map((tip, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-polkadot-pink font-black text-[9px] shrink-0">→</span>
                  <span className="text-[9px] text-gray-600 leading-relaxed">{tip}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-polkadot-border bg-black/20">
              <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Contracts</span>
            </div>
            <div className="px-4 py-3 space-y-2">
              {([
                ['ScoreNFT', SCORE_NFT_PROXY],
                ['Lending',  import.meta.env.VITE_LENDING_POOL],
              ] as [string, string][]).filter(([, addr]) => addr).map(([label, addr]) => (
                <div key={label}>
                  <div className="text-[8px] font-bold uppercase tracking-widest text-gray-700">{label}</div>
                  <a href={`${EXPLORER}/address/${addr}`} target="_blank" rel="noopener noreferrer"
                    className="font-mono text-[9px] text-gray-600 hover:text-polkadot-pink transition-colors break-all">
                    {addr} ↗
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}