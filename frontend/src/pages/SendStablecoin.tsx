import { useState, useEffect, useCallback } from 'react';
import { isAddress } from 'viem';

const EXPLORER = 'https://polkadot.testnet.routescan.io';

type Token  = 'USDT' | 'USDC';
type Status = 'idle' | 'sending' | 'success' | 'error';

const TOKEN_CFG = {
  USDT: { color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', dot: 'bg-emerald-400' },
  USDC: { color: 'text-blue-400',    border: 'border-blue-500/30',    bg: 'bg-blue-500/5',    dot: 'bg-blue-400'   },
} as const;

interface SenderInfo { ss58: string; usdt: number; usdc: number; }

async function fetchEvmBalances(address: string): Promise<{ usdt: number; usdc: number }> {
  const res  = await fetch(`/balances/${address}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Failed');
  return { usdt: Number(json.usdt ?? 0), usdc: Number(json.usdc ?? 0) };
}

export function SendStablecoin() {
  const [token,  setToken]  = useState<Token>('USDT');
  const [to,     setTo]     = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [txHash, setTxHash] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const [sender,        setSender]        = useState<SenderInfo | null>(null);
  const [senderLoading, setSenderLoading] = useState(true);

  const [checkAddr,    setCheckAddr]    = useState('');
  const [checkBals,    setCheckBals]    = useState<{ usdt: number; usdc: number } | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);

  const cfg = TOKEN_CFG[token];

  useEffect(() => {
    setSenderLoading(true);
    fetch('/transfer/sender')
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          setSender({ ss58: json.ss58, usdt: json.usdt, usdc: json.usdc });
          setCheckAddr(json.ss58);
        }
      })
      .catch(() => {})
      .finally(() => setSenderLoading(false));
  }, []);

  useEffect(() => {
    const addr = checkAddr.trim();
    if (!addr) { setCheckBals(null); return; }
    const isSenderAddr = sender && addr === sender.ss58;
    if (isSenderAddr) { setCheckBals({ usdt: sender!.usdt, usdc: sender!.usdc }); return; }
    if (!isAddress(addr)) { setCheckBals(null); return; }
    let dead = false;
    const load = async () => {
      setCheckLoading(true);
      try { const b = await fetchEvmBalances(addr); if (!dead) setCheckBals(b); }
      catch { /* ignore */ }
      finally { if (!dead) setCheckLoading(false); }
    };
    load();
    const iv = setInterval(load, 15_000);
    return () => { dead = true; clearInterval(iv); };
  }, [checkAddr, sender]);

  const refreshSender = useCallback(() => {
    setTimeout(() => {
      fetch('/transfer/sender')
        .then(r => r.json())
        .then(json => {
          if (json.success) {
            setSender({ ss58: json.ss58, usdt: json.usdt, usdc: json.usdc });
            if (checkAddr === json.ss58) setCheckBals({ usdt: json.usdt, usdc: json.usdc });
          }
        })
        .catch(() => {});
    }, 4_000);
  }, [checkAddr]);

  const senderBalance = sender ? (token === 'USDT' ? sender.usdt : sender.usdc) : 0;
  const toValid       = isAddress(to);
  const amtNum        = parseFloat(amount);
  const amtValid      = !isNaN(amtNum) && amtNum > 0;
  const tooMuch       = amtValid && amtNum > senderBalance;
  const canSend       = toValid && amtValid && !tooMuch && status === 'idle' && !!sender;

  const handleSwitch = (t: Token) => {
    setToken(t); setAmount(''); setStatus('idle'); setErrMsg(''); setTxHash('');
  };

  const handleSend = useCallback(async () => {
    if (!canSend) return;
    setStatus('sending'); setErrMsg(''); setTxHash('');
    try {
      const res  = await fetch('/transfer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ to, amount: amtNum, token }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Transfer failed');
      setTxHash(json.txHash); setStatus('success'); refreshSender();
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? 'Unknown error';
      setErrMsg(msg.length > 180 ? msg.slice(0, 180) + '…' : msg);
      setStatus('error');
    }
  }, [canSend, to, amtNum, token, refreshSender]);

  const reset = () => { setStatus('idle'); setErrMsg(''); setTxHash(''); setAmount(''); };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-black tracking-tight text-white">
          Send <span className="text-polkadot-pink">Stablecoin</span>
        </h1>
        <p className="text-[10px] text-gray-600 mt-0.5 font-medium">
          No wallet needed · Backend-signed · USDT &amp; USDC
        </p>
      </div>

      {/* Token tabs */}
      <div className="bg-polkadot-card border border-polkadot-border rounded-xl p-1 flex gap-1">
        {(['USDT', 'USDC'] as Token[]).map(t => (
          <button key={t} onClick={() => handleSwitch(t)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border ${
              token === t
                ? `${TOKEN_CFG[t].bg} ${TOKEN_CFG[t].color} ${TOKEN_CFG[t].border}`
                : 'text-gray-600 hover:text-gray-400 border-transparent'
            }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${TOKEN_CFG[t].dot}`} />
            {t}
          </button>
        ))}
      </div>

      {/* Sender balance */}
      <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-polkadot-border bg-black/20">
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Backend Wallet</span>
        </div>
        <div className="px-4 py-3">
          {senderLoading ? (
            <div className="h-5 w-48 bg-white/5 rounded-lg animate-pulse" />
          ) : sender ? (
            <div className="space-y-2">
              <p className="text-[9px] font-mono text-gray-600 break-all">{sender.ss58}</p>
              <div className="flex gap-2">
                {(['USDT', 'USDC'] as Token[]).map(t => {
                  const val    = t === 'USDT' ? sender.usdt : sender.usdc;
                  const active = t === token;
                  return (
                    <div key={t} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[9px] font-bold uppercase tracking-wide transition-all ${
                      active
                        ? `${TOKEN_CFG[t].bg} ${TOKEN_CFG[t].border} ${TOKEN_CFG[t].color}`
                        : 'bg-white/5 border-white/10 text-gray-600'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${TOKEN_CFG[t].dot}`} />
                      {val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {t}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs font-semibold text-red-400">✗ Could not load sender — check backend</p>
          )}
        </div>
      </div>

      {/* Check any address */}
      <div className="space-y-1.5">
        <div className="text-[8px] font-bold uppercase tracking-widest text-gray-700">Check Any Address Balance</div>
        <div className={`flex items-center bg-polkadot-card border rounded-xl overflow-hidden transition-colors ${
          checkAddr && !checkAddr.startsWith('5') && !isAddress(checkAddr)
            ? 'border-red-500/40'
            : 'border-polkadot-border focus-within:border-polkadot-pink/40'
        }`}>
          <input type="text" value={checkAddr} onChange={e => setCheckAddr(e.target.value)}
            placeholder="0x… or SS58 address"
            className="flex-1 bg-transparent px-4 py-2.5 text-xs font-mono text-white placeholder-gray-700 outline-none" />
          {checkLoading && (
            <span className="w-3 h-3 border-2 border-gray-600 border-t-gray-400 rounded-full animate-spin mx-3 shrink-0" />
          )}
        </div>
        {checkBals && checkAddr && (
          <div className="flex gap-2 pt-0.5">
            {(['USDT', 'USDC'] as Token[]).map(t => {
              const val = t === 'USDT' ? checkBals.usdt : checkBals.usdc;
              return (
                <div key={t} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[9px] font-bold uppercase tracking-wide ${TOKEN_CFG[t].bg} ${TOKEN_CFG[t].border} ${TOKEN_CFG[t].color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${TOKEN_CFG[t].dot}`} />
                  {val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {t}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-polkadot-border" />

      {/* Recipient */}
      <div className="space-y-1.5">
        <div className="text-[8px] font-bold uppercase tracking-widest text-gray-700">Recipient (0x Address)</div>
        <input type="text" value={to} onChange={e => setTo(e.target.value)}
          placeholder="0x…" disabled={status === 'sending'}
          className={`w-full bg-polkadot-card border rounded-xl px-4 py-2.5 text-xs font-mono text-white placeholder-gray-700 outline-none transition-colors ${
            to && !toValid  ? 'border-red-500/40'
            : to && toValid ? 'border-emerald-500/30'
            :                 'border-polkadot-border focus:border-polkadot-pink/40'
          }`}
        />
        {to && !toValid && <p className="text-[9px] font-bold text-red-400">✗ Invalid EVM address</p>}
      </div>

      {/* Amount */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="text-[8px] font-bold uppercase tracking-widest text-gray-700">Amount</div>
          {senderBalance > 0 && (
            <button onClick={() => setAmount(senderBalance.toFixed(6))}
              className={`text-[9px] font-bold uppercase tracking-widest hover:opacity-70 transition-opacity ${cfg.color}`}>
              Max: {senderBalance.toFixed(4)} {token}
            </button>
          )}
        </div>
        <div className={`flex items-center bg-polkadot-card border rounded-xl overflow-hidden transition-colors ${
          tooMuch              ? 'border-red-500/40'
          : amount && amtValid ? cfg.border
          :                      'border-polkadot-border focus-within:border-polkadot-pink/40'
        }`}>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0.00" min="0" step="0.01"
            disabled={status === 'sending'}
            className="flex-1 bg-transparent px-4 py-2.5 text-sm font-mono text-white placeholder-gray-700 outline-none" />
          <span className={`px-4 text-[9px] font-black uppercase tracking-widest border-l border-polkadot-border ${cfg.color}`}>
            {token}
          </span>
        </div>
        {tooMuch && (
          <p className="text-[9px] font-bold text-red-400">
            ✗ Exceeds available {token} ({senderBalance.toFixed(4)})
          </p>
        )}
      </div>

      {/* Status banners */}
      {status === 'sending' && (
        <div className="flex items-center gap-2.5 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-2.5">
          <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-blue-400">Mining on Hub… (~12–15s)</span>
        </div>
      )}
      {status === 'success' && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3 space-y-1.5">
          <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-400">✓ {token} Sent &amp; Finalized</div>
          {txHash && (
            <a href={`${EXPLORER}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
              className="block font-mono text-[9px] text-gray-600 hover:text-polkadot-pink break-all transition-colors">
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
          {status === 'sending' ? 'Finalizing…' : `Send ${token}`}
        </button>
      )}

      {/* Info row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">

        {/* How it works */}
        <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-polkadot-border bg-black/20">
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">How It Works</span>
          </div>
          <div className="px-4 py-3 space-y-2">
            {[
              ['No wallet needed', 'Backend signs via Substrate Assets Pallet.'],
              ['SS58 conversion',  'Recipient 0x auto-converts to SS58.'],
              ['Finality',         'Settles in ~12–15s (Paseo).'],
            ].map(([title, desc]) => (
              <div key={title} className="flex gap-2">
                <span className="text-polkadot-pink font-black text-[9px] shrink-0">→</span>
                <div>
                  <div className="text-[8px] font-bold uppercase tracking-widest text-gray-500">{title}</div>
                  <div className="text-[8px] text-gray-700 mt-0.5 leading-relaxed">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Token info */}
        <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-polkadot-border bg-black/20">
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Token Info</span>
          </div>
          <div className="grid grid-cols-1 gap-px bg-polkadot-border">
            {([
              ['USDT Asset ID', '1984'],
              ['USDC Asset ID', '1337'],
              ['Decimals',      '6'],
              ['Network',       'Paseo Asset Hub'],
              ['Pallet',        'assets.transfer'],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="bg-polkadot-card px-4 py-2 flex justify-between items-center">
                <span className="text-[8px] font-bold uppercase tracking-widest text-gray-700">{k}</span>
                <span className="text-[9px] font-mono text-gray-500">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}