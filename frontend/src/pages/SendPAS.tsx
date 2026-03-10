'use client';

import { useState, useCallback, useRef } from 'react';
import { useAccount, useBalance, useSendTransaction, useChainId, useSwitchChain } from 'wagmi';
import { parseEther, isAddress } from 'viem';
import { pasTestnet } from '../utils/wagmi';

const EXPLORER = 'https://polkadot.testnet.routescan.io';
const RPC_URL  = 'https://pas-rpc.stakeworld.io/assethub';

type Status = 'idle' | 'signing' | 'mining' | 'success' | 'error';

export function SendPAS({ onSuccess }: { onSuccess?: () => void } = {}) {
  const { address, isConnected } = useAccount();
  const chainId                  = useChainId();
  const { switchChain }          = useSwitchChain();
  const isWrongNetwork           = isConnected && chainId !== pasTestnet.id;

  const { data: balData, refetch: refetchBal } = useBalance({ 
    address, 
    chainId: pasTestnet.id,
    query: { refetchInterval: 10_000 } 
  });
  const balance = balData ? Number(balData.value) / 1e18 : 0;

  const [to,     setTo]     = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [errMsg, setErrMsg] = useState('');
  const statusRef = useRef<Status>('idle');

  const setStatusSync = useCallback((s: Status) => { 
    statusRef.current = s; 
    setStatus(s); 
  }, []);

  const { sendTransactionAsync } = useSendTransaction();

  // ── Reset Function (Fixed Scope pa!) ──
  const handleReset = useCallback(() => {
    statusRef.current = 'idle';
    setStatus('idle');
    setTxHash(undefined);
    setErrMsg('');
    setTo('');
    setAmount('');
  }, []);

  const toValid     = to.trim() !== '' && isAddress(to.trim());
  const amtNum      = parseFloat(amount);
  const amtValid    = !isNaN(amtNum) && amtNum > 0 && amtNum <= balance;
  const canSend     = isConnected && !isWrongNetwork && toValid && amtValid && status === 'idle';

  const setMax = () => {
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
      });
      
      setTxHash(hash);
      setStatusSync('mining');

      const interval = setInterval(async () => {
        try {
          const res = await fetch(RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0', id: 1,
              method: 'eth_getTransactionReceipt',
              params: [hash],
            }),
          });
          const json = await res.json();

          if (json?.result?.status === '0x1') {
            clearInterval(interval);
            setStatusSync('success');
            refetchBal();
            onSuccess?.();
          } else if (json?.result?.status === '0x0') {
            clearInterval(interval);
            setStatusSync('error');
            setErrMsg('Transaction reverted on-chain.');
          }
        } catch { /* keep polling */ }
      }, 2000);

      setTimeout(() => clearInterval(interval), 60_000);

    } catch (err: any) {
      setErrMsg(err.message.includes('rejected') ? 'Transaction rejected.' : 'Insufficient PAS for gas.');
      setStatusSync('error');
    }
  }, [canSend, to, amount, sendTransactionAsync, refetchBal, onSuccess, setStatusSync]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-10">
      
      <div className="space-y-2">
        <h1 className="text-3xl font-black tracking-tighter uppercase italic text-white">
          Native <span className="text-polkadot-pink text-4xl">PAS</span> Transfer
        </h1>
        <p className="text-gray-500 text-sm font-medium uppercase tracking-widest">
          L1 Gas Token · Polkadot Hub Parachain Native
        </p>
      </div>

      {isWrongNetwork && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-center justify-between">
          <span className="text-amber-400 text-sm font-bold uppercase tracking-tight">⚠️ Switch to Polkadot Hub</span>
          <button onClick={() => switchChain({ chainId: pasTestnet.id })} className="bg-amber-500 hover:bg-amber-400 text-black font-black px-4 py-2 rounded-xl text-[10px] uppercase">
            Switch
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 bg-polkadot-card border border-polkadot-border rounded-3xl overflow-hidden shadow-2xl">
          <div className="px-6 py-4 border-b border-polkadot-border bg-black/20 text-[10px] text-gray-500 font-black uppercase tracking-widest">
            Transaction Details
          </div>

          <div className="p-8 space-y-8">
            <div className="space-y-2">
              <label className="text-[10px] text-gray-600 font-black uppercase tracking-widest ml-1">From Wallet</label>
              <div className="bg-polkadot-dark border border-polkadot-border rounded-2xl px-5 py-4 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <span className="font-mono text-xs text-gray-400 truncate flex-1">{isConnected ? address : 'Not connected'}</span>
                {isConnected && <span className="text-[10px] font-black text-polkadot-pink uppercase">{balance.toFixed(4)} PAS</span>}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] text-gray-600 font-black uppercase tracking-widest ml-1">Recipient Address</label>
              <input
                type="text"
                value={to}
                onChange={e => setTo(e.target.value)}
                placeholder="0x..."
                className="w-full bg-polkadot-dark border border-polkadot-border rounded-2xl px-5 py-4 text-sm font-mono text-white placeholder-gray-800 outline-none focus:border-polkadot-pink/40"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-end ml-1">
                <label className="text-[10px] text-gray-600 font-black uppercase tracking-widest">Amount</label>
                <button onClick={setMax} className="text-polkadot-pink text-[10px] font-black uppercase hover:opacity-70">Use Max</button>
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-polkadot-dark border border-polkadot-border rounded-2xl px-5 py-4 text-xl font-mono text-white placeholder-gray-800 outline-none"
                />
                <div className="absolute right-5 top-1/2 -translate-y-1/2 font-black text-sm uppercase text-gray-500">PAS</div>
              </div>
            </div>

            {status === 'success' ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 text-center space-y-4">
                <div className="text-emerald-400 font-black uppercase tracking-widest text-sm">✦ Transaction Confirmed</div>
                <button onClick={handleReset} className="text-gray-500 text-[10px] font-bold uppercase underline hover:text-white">Send Another</button>
              </div>
            ) : (
              <button
                onClick={handleSend}
                disabled={!canSend}
                className={`w-full py-5 rounded-2xl font-black uppercase tracking-widest text-sm transition-all ${
                  canSend ? 'bg-polkadot-pink text-white shadow-lg' : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                }`}
              >
                {status === 'signing' ? 'Check MetaMask...' : status === 'mining' ? 'Mining on Paseo...' : 'Send PAS Token'}
              </button>
            )}

            {errMsg && <div className="text-red-400 text-[10px] font-black uppercase text-center">{errMsg}</div>}
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-polkadot-card border border-polkadot-border rounded-3xl p-6 space-y-4">
            <h3 className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Network Info</h3>
            <div className="space-y-3">
              {[ ['Network', 'Paseo'], ['ID', pasTestnet.id.toString()], ['Symbol', 'PAS'] ].map(([k, v]) => (
                <div key={k} className="flex justify-between items-center text-[10px] font-bold">
                  <span className="text-gray-600 uppercase">{k}</span>
                  <span className="font-mono text-gray-300">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
