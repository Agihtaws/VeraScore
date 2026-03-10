'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAccount, useWriteContract, useChainId, useSwitchChain } from 'wagmi';
import { isAddress, parseUnits, getAddress }        from 'viem';
import { pasTestnet, USDT_ERC20, USDC_ERC20 }       from '../utils/wagmi';

const EXPLORER = 'https://polkadot.testnet.routescan.io';
// Using the fast RPC so transaction detection is instant pa!
const RPC_URL  = 'https://pas-rpc.stakeworld.io/assethub';

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
    bg:       'bg-emerald-500/10',
    border:   'border-emerald-500/20',
    dot:      'bg-emerald-400',
    explorer: `${EXPLORER}/token/${USDT_ERC20}`,
  },
  USDC: {
    address:  getAddress(USDC_ERC20),
    assetId:  1337,
    decimals: 6,
    color:    'text-blue-400',
    bg:       'bg-blue-500/10',
    border:   'border-blue-500/20',
    dot:      'bg-blue-400',
    explorer: `${EXPLORER}/token/${USDC_ERC20}`,
  },
};

async function pollReceipt(hash: string): Promise<'confirmed' | 'reverted'> {
  // 40 attempts x 3s = 2 mins max poll
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const res  = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'eth_getTransactionReceipt',
          params: [hash],
        }),
        signal: AbortSignal.timeout(5000),
      });
      const json = await res.json();
      if (json.result?.blockNumber) {
        return json.result.status === '0x1' ? 'confirmed' : 'reverted';
      }
    } catch (e) {
      console.warn(`[SendStablecoin] poll error:`, e);
    }
  }
  return 'confirmed'; // Fallback
}

async function fetchStableBalances(address: string): Promise<{ usdt: number; usdc: number }> {
  try {
    const res  = await fetch(`/balances/${address}`);
    const json = await res.json();
    if (!json.success) return { usdt: 0, usdc: 0 };
    return { usdt: json.usdt, usdc: json.usdc };
  } catch (e) {
    return { usdt: 0, usdc: 0 };
  }
}

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

  const pauseUntil = useRef<number>(0);
  const cfg        = TOKEN_CONFIG[token];
  const balance    = balances !== null ? (token === 'USDT' ? balances.usdt : balances.usdc) : null;

  useEffect(() => {
    if (!isConnected || !address) {
      setBalances(null);
      return;
    }
    let cancelled = false;
    const doFetch = () => {
      if (Date.now() < pauseUntil.current || cancelled) return;
      fetchStableBalances(address).then(b => {
        if (!cancelled) {
          setBalances(b);
          setBalLoading(false);
        }
      });
    };

    setBalLoading(true);
    doFetch();
    const iv = setInterval(doFetch, 15000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [address, isConnected]);

  const handleTokenSwitch = (t: Token) => {
    setToken(t);
    setAmount('');
    setStatus('idle');
    setErrMsg('');
    setTxHash(undefined);
  };

  const toValid         = to.trim() !== '' && isAddress(to.trim());
  const amtNum          = parseFloat(amount);
  const amtValid        = !isNaN(amtNum) && amtNum > 0;
  const amtInsufficient = balance !== null && amtValid && amtNum > balance;
  const canSend         = isConnected && !isWrongNetwork && toValid && amtValid && !amtInsufficient && status === 'idle';

  const { writeContractAsync } = useWriteContract();

  const handleSend = useCallback(async () => {
    if (!canSend || !address) return;

    setStatus('signing');
    setErrMsg('');

    try {
      const hash = await writeContractAsync({
        address:      cfg.address,
        abi:          ERC20_ABI,
        functionName: 'transfer',
        args:         [to.trim() as `0x${string}`, parseUnits(amount, cfg.decimals)],
      });

      setTxHash(hash);
      setStatus('mining');

      const result = await pollReceipt(hash);

      if (result === 'confirmed') {
        setStatus('success');
        // Optimistic update
        const sent = parseFloat(amount);
        pauseUntil.current = Date.now() + 20000;
        setBalances(prev => prev ? {
          usdt: token === 'USDT' ? Math.max(0, prev.usdt - sent) : prev.usdt,
          usdc: token === 'USDC' ? Math.max(0, prev.usdc - sent) : prev.usdc,
        } : null);
      } else {
        setStatus('error');
        setErrMsg('Transaction reverted on-chain.');
      }

    } catch (err: any) {
      setErrMsg(err.message.includes('rejected') ? 'Transaction rejected.' : 'Transfer failed.');
      setStatus('error');
    }
  }, [canSend, address, cfg, to, amount, token, writeContractAsync]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-10">
      
      <div className="space-y-2">
        <h1 className="text-3xl font-black tracking-tighter uppercase italic text-white">
          Stablecoin <span className="text-polkadot-pink text-4xl">Transfer</span>
        </h1>
        <p className="text-gray-500 text-sm font-medium uppercase tracking-widest">
          Native Assets Pallet Precompiles · Zero-Bridge Architecture
        </p>
      </div>

      {isWrongNetwork && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-amber-500/5">
          <span className="text-amber-400 text-sm font-bold uppercase tracking-tight">⚠️ Network Mismatch: Switch to Polkadot Hub</span>
          <button onClick={() => switchChain({ chainId: pasTestnet.id })} className="bg-amber-500 hover:bg-amber-400 text-black font-black px-4 py-2 rounded-xl text-[10px] uppercase transition-all">
            Switch Now
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Main Form */}
        <div className="lg:col-span-8 bg-polkadot-card border border-polkadot-border rounded-3xl overflow-hidden shadow-2xl">
          <div className="flex border-b border-polkadot-border bg-black/20 p-2 gap-2">
            {(['USDT', 'USDC'] as Token[]).map(t => (
              <button
                key={t}
                onClick={() => handleTokenSwitch(t)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${
                  token === t ? `${TOKEN_CONFIG[t].bg} ${TOKEN_CONFIG[t].color} border border-white/5` : 'text-gray-600 hover:text-gray-400'
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${TOKEN_CONFIG[t].dot}`} />
                {t}
              </button>
            ))}
          </div>

          <div className="p-8 space-y-8">
            <div className="space-y-2">
              <label className="text-[10px] text-gray-600 font-black uppercase tracking-widest ml-1">Recipient Address</label>
              <input
                type="text"
                value={to}
                onChange={e => setTo(e.target.value)}
                placeholder="0x..."
                className="w-full bg-polkadot-dark border border-polkadot-border rounded-2xl px-5 py-4 text-sm font-mono text-white placeholder-gray-800 outline-none focus:border-polkadot-pink/40 transition-all shadow-inner"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-end ml-1">
                <label className="text-[10px] text-gray-600 font-black uppercase tracking-widest">Amount to Send</label>
                {balance !== null && balance > 0 && (
                  <button onClick={() => setAmount(balance.toFixed(6))} className={`${cfg.color} text-[10px] font-black uppercase hover:opacity-70 transition-opacity`}>
                    Max: {balance.toFixed(2)}
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-polkadot-dark border border-polkadot-border rounded-2xl px-5 py-4 text-xl font-mono text-white placeholder-gray-800 outline-none focus:border-polkadot-pink/40 transition-all shadow-inner"
                />
                <div className={`absolute right-5 top-1/2 -translate-y-1/2 font-black text-sm uppercase ${cfg.color}`}>{token}</div>
              </div>
            </div>

            {status === 'success' ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 text-center space-y-4">
                <div className="text-emerald-400 font-black uppercase tracking-widest text-sm">✦ Transfer Successful</div>
                <button onClick={() => setStatus('idle')} className="text-gray-500 text-[10px] font-bold uppercase underline hover:text-white transition-colors">Send Another</button>
              </div>
            ) : (
              <button
                onClick={handleSend}
                disabled={!canSend}
                className={`w-full py-5 rounded-2xl font-black uppercase tracking-widest text-sm transition-all shadow-lg ${
                  canSend ? 'bg-polkadot-pink text-white shadow-polkadot-pink/20 hover:scale-[1.02] active:scale-[0.98]' : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                }`}
              >
                {status === 'signing' ? 'Check MetaMask...' : status === 'mining' ? 'Confirming on Hub...' : `Transfer ${token}`}
              </button>
            )}

            {errMsg && <div className="text-red-400 text-[10px] font-black uppercase text-center">{errMsg}</div>}
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-polkadot-card border border-polkadot-border rounded-3xl p-6 space-y-4 shadow-xl">
            <h3 className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Network Logic</h3>
            <div className="space-y-4 text-[11px] leading-relaxed text-gray-400 font-medium">
              <p>Transfers are executed via <span className="text-white">ERC-20 Precompiles</span> which map directly to the Substrate Assets Pallet.</p>
              <p>Gas is settled in <span className="text-emerald-400">PAS</span> tokens. No ETH or bridge fees required.</p>
            </div>
          </div>

          {isConnected && (
            <div className="bg-polkadot-card border border-polkadot-border rounded-3xl p-6 space-y-4 shadow-xl">
              <h3 className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Your Balances</h3>
              <div className="space-y-3">
                {['USDT', 'USDC'].map(t => (
                  <div key={t} className="flex justify-between items-center bg-black/20 p-3 rounded-xl border border-white/5">
                    <span className="text-[10px] font-black text-gray-500">{t}</span>
                    <span className="text-xs font-mono text-white">
                      {balLoading ? '...' : (t === 'USDT' ? balances?.usdt : balances?.usdc)?.toFixed(2) ?? '0.00'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
