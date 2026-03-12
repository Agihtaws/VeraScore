import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
import { isAddress } from 'viem';
const EXPLORER = 'https://polkadot.testnet.routescan.io';
const TOKEN_CFG = {
    USDT: { color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', dot: 'bg-emerald-400' },
    USDC: { color: 'text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-500/5', dot: 'bg-blue-400' },
};
async function fetchEvmBalances(address) {
    const res = await fetch(`/balances/${address}`);
    const json = await res.json();
    if (!json.success)
        throw new Error(json.error ?? 'Failed');
    return { usdt: Number(json.usdt ?? 0), usdc: Number(json.usdc ?? 0) };
}
export function SendStablecoin() {
    const [token, setToken] = useState('USDT');
    const [to, setTo] = useState('');
    const [amount, setAmount] = useState('');
    const [status, setStatus] = useState('idle');
    const [txHash, setTxHash] = useState('');
    const [errMsg, setErrMsg] = useState('');
    const [sender, setSender] = useState(null);
    const [senderLoading, setSenderLoading] = useState(true);
    const [checkAddr, setCheckAddr] = useState('');
    const [checkBals, setCheckBals] = useState(null);
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
            .catch(() => { })
            .finally(() => setSenderLoading(false));
    }, []);
    useEffect(() => {
        const addr = checkAddr.trim();
        if (!addr) {
            setCheckBals(null);
            return;
        }
        const isSenderAddr = sender && addr === sender.ss58;
        if (isSenderAddr) {
            setCheckBals({ usdt: sender.usdt, usdc: sender.usdc });
            return;
        }
        if (!isAddress(addr)) {
            setCheckBals(null);
            return;
        }
        let dead = false;
        const load = async () => {
            setCheckLoading(true);
            try {
                const b = await fetchEvmBalances(addr);
                if (!dead)
                    setCheckBals(b);
            }
            catch { /* ignore */ }
            finally {
                if (!dead)
                    setCheckLoading(false);
            }
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
                    if (checkAddr === json.ss58)
                        setCheckBals({ usdt: json.usdt, usdc: json.usdc });
                }
            })
                .catch(() => { });
        }, 4_000);
    }, [checkAddr]);
    const senderBalance = sender ? (token === 'USDT' ? sender.usdt : sender.usdc) : 0;
    const toValid = isAddress(to);
    const amtNum = parseFloat(amount);
    const amtValid = !isNaN(amtNum) && amtNum > 0;
    const tooMuch = amtValid && amtNum > senderBalance;
    const canSend = toValid && amtValid && !tooMuch && status === 'idle' && !!sender;
    const handleSwitch = (t) => {
        setToken(t);
        setAmount('');
        setStatus('idle');
        setErrMsg('');
        setTxHash('');
    };
    const handleSend = useCallback(async () => {
        if (!canSend)
            return;
        setStatus('sending');
        setErrMsg('');
        setTxHash('');
        try {
            const res = await fetch('/transfer', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to, amount: amtNum, token }),
            });
            const json = await res.json();
            if (!json.success)
                throw new Error(json.error ?? 'Transfer failed');
            setTxHash(json.txHash);
            setStatus('success');
            refreshSender();
        }
        catch (e) {
            const msg = e?.message ?? 'Unknown error';
            setErrMsg(msg.length > 180 ? msg.slice(0, 180) + '…' : msg);
            setStatus('error');
        }
    }, [canSend, to, amtNum, token, refreshSender]);
    const reset = () => { setStatus('idle'); setErrMsg(''); setTxHash(''); setAmount(''); };
    return (_jsxs("div", { className: "max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-xl font-black tracking-tight text-white", children: ["Send ", _jsx("span", { className: "text-polkadot-pink", children: "Stablecoin" })] }), _jsx("p", { className: "text-[10px] text-gray-600 mt-0.5 font-medium", children: "No wallet needed \u00B7 Backend-signed \u00B7 USDT & USDC" })] }), _jsx("div", { className: "bg-polkadot-card border border-polkadot-border rounded-xl p-1 flex gap-1", children: ['USDT', 'USDC'].map(t => (_jsxs("button", { onClick: () => handleSwitch(t), className: `flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border ${token === t
                        ? `${TOKEN_CFG[t].bg} ${TOKEN_CFG[t].color} ${TOKEN_CFG[t].border}`
                        : 'text-gray-600 hover:text-gray-400 border-transparent'}`, children: [_jsx("span", { className: `w-1.5 h-1.5 rounded-full ${TOKEN_CFG[t].dot}` }), t] }, t))) }), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsx("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20", children: _jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-gray-500", children: "Backend Wallet" }) }), _jsx("div", { className: "px-4 py-3", children: senderLoading ? (_jsx("div", { className: "h-5 w-48 bg-white/5 rounded-lg animate-pulse" })) : sender ? (_jsxs("div", { className: "space-y-2", children: [_jsx("p", { className: "text-[9px] font-mono text-gray-600 break-all", children: sender.ss58 }), _jsx("div", { className: "flex gap-2", children: ['USDT', 'USDC'].map(t => {
                                        const val = t === 'USDT' ? sender.usdt : sender.usdc;
                                        const active = t === token;
                                        return (_jsxs("div", { className: `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[9px] font-bold uppercase tracking-wide transition-all ${active
                                                ? `${TOKEN_CFG[t].bg} ${TOKEN_CFG[t].border} ${TOKEN_CFG[t].color}`
                                                : 'bg-white/5 border-white/10 text-gray-600'}`, children: [_jsx("span", { className: `w-1.5 h-1.5 rounded-full ${TOKEN_CFG[t].dot}` }), val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }), " ", t] }, t));
                                    }) })] })) : (_jsx("p", { className: "text-xs font-semibold text-red-400", children: "\u2717 Could not load sender \u2014 check backend" })) })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsx("div", { className: "text-[8px] font-bold uppercase tracking-widest text-gray-700", children: "Check Any Address Balance" }), _jsxs("div", { className: `flex items-center bg-polkadot-card border rounded-xl overflow-hidden transition-colors ${checkAddr && !checkAddr.startsWith('5') && !isAddress(checkAddr)
                            ? 'border-red-500/40'
                            : 'border-polkadot-border focus-within:border-polkadot-pink/40'}`, children: [_jsx("input", { type: "text", value: checkAddr, onChange: e => setCheckAddr(e.target.value), placeholder: "0x\u2026 or SS58 address", className: "flex-1 bg-transparent px-4 py-2.5 text-xs font-mono text-white placeholder-gray-700 outline-none" }), checkLoading && (_jsx("span", { className: "w-3 h-3 border-2 border-gray-600 border-t-gray-400 rounded-full animate-spin mx-3 shrink-0" }))] }), checkBals && checkAddr && (_jsx("div", { className: "flex gap-2 pt-0.5", children: ['USDT', 'USDC'].map(t => {
                            const val = t === 'USDT' ? checkBals.usdt : checkBals.usdc;
                            return (_jsxs("div", { className: `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[9px] font-bold uppercase tracking-wide ${TOKEN_CFG[t].bg} ${TOKEN_CFG[t].border} ${TOKEN_CFG[t].color}`, children: [_jsx("span", { className: `w-1.5 h-1.5 rounded-full ${TOKEN_CFG[t].dot}` }), val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }), " ", t] }, t));
                        }) }))] }), _jsx("div", { className: "border-t border-polkadot-border" }), _jsxs("div", { className: "space-y-1.5", children: [_jsx("div", { className: "text-[8px] font-bold uppercase tracking-widest text-gray-700", children: "Recipient (0x Address)" }), _jsx("input", { type: "text", value: to, onChange: e => setTo(e.target.value), placeholder: "0x\u2026", disabled: status === 'sending', className: `w-full bg-polkadot-card border rounded-xl px-4 py-2.5 text-xs font-mono text-white placeholder-gray-700 outline-none transition-colors ${to && !toValid ? 'border-red-500/40'
                            : to && toValid ? 'border-emerald-500/30'
                                : 'border-polkadot-border focus:border-polkadot-pink/40'}` }), to && !toValid && _jsx("p", { className: "text-[9px] font-bold text-red-400", children: "\u2717 Invalid EVM address" })] }), _jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("div", { className: "text-[8px] font-bold uppercase tracking-widest text-gray-700", children: "Amount" }), senderBalance > 0 && (_jsxs("button", { onClick: () => setAmount(senderBalance.toFixed(6)), className: `text-[9px] font-bold uppercase tracking-widest hover:opacity-70 transition-opacity ${cfg.color}`, children: ["Max: ", senderBalance.toFixed(4), " ", token] }))] }), _jsxs("div", { className: `flex items-center bg-polkadot-card border rounded-xl overflow-hidden transition-colors ${tooMuch ? 'border-red-500/40'
                            : amount && amtValid ? cfg.border
                                : 'border-polkadot-border focus-within:border-polkadot-pink/40'}`, children: [_jsx("input", { type: "number", value: amount, onChange: e => setAmount(e.target.value), placeholder: "0.00", min: "0", step: "0.01", disabled: status === 'sending', className: "flex-1 bg-transparent px-4 py-2.5 text-sm font-mono text-white placeholder-gray-700 outline-none" }), _jsx("span", { className: `px-4 text-[9px] font-black uppercase tracking-widest border-l border-polkadot-border ${cfg.color}`, children: token })] }), tooMuch && (_jsxs("p", { className: "text-[9px] font-bold text-red-400", children: ["\u2717 Exceeds available ", token, " (", senderBalance.toFixed(4), ")"] }))] }), status === 'sending' && (_jsxs("div", { className: "flex items-center gap-2.5 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-2.5", children: [_jsx("span", { className: "w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" }), _jsx("span", { className: "text-[9px] font-bold uppercase tracking-widest text-blue-400", children: "Mining on Hub\u2026 (~12\u201315s)" })] })), status === 'success' && (_jsxs("div", { className: "bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3 space-y-1.5", children: [_jsxs("div", { className: "text-[9px] font-bold uppercase tracking-widest text-emerald-400", children: ["\u2713 ", token, " Sent & Finalized"] }), txHash && (_jsxs("a", { href: `${EXPLORER}/tx/${txHash}`, target: "_blank", rel: "noopener noreferrer", className: "block font-mono text-[9px] text-gray-600 hover:text-polkadot-pink break-all transition-colors", children: [txHash, " \u2197"] })), _jsx("button", { onClick: reset, className: "text-[9px] font-bold uppercase tracking-widest text-gray-600 hover:text-gray-400 transition-colors", children: "Send Another \u2192" })] })), status === 'error' && (_jsxs("div", { className: "bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3 space-y-1.5", children: [_jsxs("div", { className: "text-[9px] font-bold uppercase tracking-widest text-red-400", children: ["\u2717 ", errMsg] }), _jsx("button", { onClick: reset, className: "text-[9px] font-bold uppercase tracking-widest text-gray-600 hover:text-gray-400 transition-colors", children: "Try Again \u2192" })] })), status !== 'success' && (_jsx("button", { onClick: handleSend, disabled: !canSend, className: "w-full py-3 bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_12px_rgba(230,0,122,0.2)]", children: status === 'sending' ? 'Finalizing…' : `Send ${token}` })), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1", children: [_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsx("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20", children: _jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-gray-500", children: "How It Works" }) }), _jsx("div", { className: "px-4 py-3 space-y-2", children: [
                                    ['No wallet needed', 'Backend signs via Substrate Assets Pallet.'],
                                    ['SS58 conversion', 'Recipient 0x auto-converts to SS58.'],
                                    ['Finality', 'Settles in ~12–15s (Paseo).'],
                                ].map(([title, desc]) => (_jsxs("div", { className: "flex gap-2", children: [_jsx("span", { className: "text-polkadot-pink font-black text-[9px] shrink-0", children: "\u2192" }), _jsxs("div", { children: [_jsx("div", { className: "text-[8px] font-bold uppercase tracking-widest text-gray-500", children: title }), _jsx("div", { className: "text-[8px] text-gray-700 mt-0.5 leading-relaxed", children: desc })] })] }, title))) })] }), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsx("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20", children: _jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-gray-500", children: "Token Info" }) }), _jsx("div", { className: "grid grid-cols-1 gap-px bg-polkadot-border", children: [
                                    ['USDT Asset ID', '1984'],
                                    ['USDC Asset ID', '1337'],
                                    ['Decimals', '6'],
                                    ['Network', 'Paseo Asset Hub'],
                                    ['Pallet', 'assets.transfer'],
                                ].map(([k, v]) => (_jsxs("div", { className: "bg-polkadot-card px-4 py-2 flex justify-between items-center", children: [_jsx("span", { className: "text-[8px] font-bold uppercase tracking-widest text-gray-700", children: k }), _jsx("span", { className: "text-[9px] font-mono text-gray-500", children: v })] }, k))) })] })] })] }));
}
