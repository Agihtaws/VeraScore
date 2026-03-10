'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useCallback, useRef } from 'react';
import { useAccount, useBalance, useSendTransaction, useChainId, useSwitchChain } from 'wagmi';
import { parseEther, isAddress } from 'viem';
import { pasTestnet } from '../utils/wagmi';
const EXPLORER = 'https://polkadot.testnet.routescan.io';
const RPC_URL = 'https://pas-rpc.stakeworld.io/assethub';
export function SendPAS({ onSuccess } = {}) {
    const { address, isConnected } = useAccount();
    const chainId = useChainId();
    const { switchChain } = useSwitchChain();
    const isWrongNetwork = isConnected && chainId !== pasTestnet.id;
    const { data: balData, refetch: refetchBal } = useBalance({
        address,
        chainId: pasTestnet.id,
        query: { refetchInterval: 10_000 }
    });
    const balance = balData ? Number(balData.value) / 1e18 : 0;
    const [to, setTo] = useState('');
    const [amount, setAmount] = useState('');
    const [status, setStatus] = useState('idle');
    const [txHash, setTxHash] = useState();
    const [errMsg, setErrMsg] = useState('');
    const statusRef = useRef('idle');
    const setStatusSync = useCallback((s) => {
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
    const toValid = to.trim() !== '' && isAddress(to.trim());
    const amtNum = parseFloat(amount);
    const amtValid = !isNaN(amtNum) && amtNum > 0 && amtNum <= balance;
    const canSend = isConnected && !isWrongNetwork && toValid && amtValid && status === 'idle';
    const setMax = () => {
        const max = Math.max(0, balance - 0.001);
        setAmount(max.toFixed(6));
    };
    const handleSend = useCallback(async () => {
        if (!canSend)
            return;
        setStatusSync('signing');
        setErrMsg('');
        setTxHash(undefined);
        try {
            const hash = await sendTransactionAsync({
                to: to.trim(),
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
                    }
                    else if (json?.result?.status === '0x0') {
                        clearInterval(interval);
                        setStatusSync('error');
                        setErrMsg('Transaction reverted on-chain.');
                    }
                }
                catch { /* keep polling */ }
            }, 2000);
            setTimeout(() => clearInterval(interval), 60_000);
        }
        catch (err) {
            setErrMsg(err.message.includes('rejected') ? 'Transaction rejected.' : 'Insufficient PAS for gas.');
            setStatusSync('error');
        }
    }, [canSend, to, amount, sendTransactionAsync, refetchBal, onSuccess, setStatusSync]);
    return (_jsxs("div", { className: "max-w-4xl mx-auto px-4 py-12 space-y-10", children: [_jsxs("div", { className: "space-y-2", children: [_jsxs("h1", { className: "text-3xl font-black tracking-tighter uppercase italic text-white", children: ["Native ", _jsx("span", { className: "text-polkadot-pink text-4xl", children: "PAS" }), " Transfer"] }), _jsx("p", { className: "text-gray-500 text-sm font-medium uppercase tracking-widest", children: "L1 Gas Token \u00B7 Polkadot Hub Parachain Native" })] }), isWrongNetwork && (_jsxs("div", { className: "bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-center justify-between", children: [_jsx("span", { className: "text-amber-400 text-sm font-bold uppercase tracking-tight", children: "\u26A0\uFE0F Switch to Polkadot Hub" }), _jsx("button", { onClick: () => switchChain({ chainId: pasTestnet.id }), className: "bg-amber-500 hover:bg-amber-400 text-black font-black px-4 py-2 rounded-xl text-[10px] uppercase", children: "Switch" })] })), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-12 gap-8", children: [_jsxs("div", { className: "lg:col-span-8 bg-polkadot-card border border-polkadot-border rounded-3xl overflow-hidden shadow-2xl", children: [_jsx("div", { className: "px-6 py-4 border-b border-polkadot-border bg-black/20 text-[10px] text-gray-500 font-black uppercase tracking-widest", children: "Transaction Details" }), _jsxs("div", { className: "p-8 space-y-8", children: [_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] text-gray-600 font-black uppercase tracking-widest ml-1", children: "From Wallet" }), _jsxs("div", { className: "bg-polkadot-dark border border-polkadot-border rounded-2xl px-5 py-4 flex items-center gap-3", children: [_jsx("div", { className: "w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" }), _jsx("span", { className: "font-mono text-xs text-gray-400 truncate flex-1", children: isConnected ? address : 'Not connected' }), isConnected && _jsxs("span", { className: "text-[10px] font-black text-polkadot-pink uppercase", children: [balance.toFixed(4), " PAS"] })] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] text-gray-600 font-black uppercase tracking-widest ml-1", children: "Recipient Address" }), _jsx("input", { type: "text", value: to, onChange: e => setTo(e.target.value), placeholder: "0x...", className: "w-full bg-polkadot-dark border border-polkadot-border rounded-2xl px-5 py-4 text-sm font-mono text-white placeholder-gray-800 outline-none focus:border-polkadot-pink/40" })] }), _jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex justify-between items-end ml-1", children: [_jsx("label", { className: "text-[10px] text-gray-600 font-black uppercase tracking-widest", children: "Amount" }), _jsx("button", { onClick: setMax, className: "text-polkadot-pink text-[10px] font-black uppercase hover:opacity-70", children: "Use Max" })] }), _jsxs("div", { className: "relative", children: [_jsx("input", { type: "number", value: amount, onChange: e => setAmount(e.target.value), placeholder: "0.00", className: "w-full bg-polkadot-dark border border-polkadot-border rounded-2xl px-5 py-4 text-xl font-mono text-white placeholder-gray-800 outline-none" }), _jsx("div", { className: "absolute right-5 top-1/2 -translate-y-1/2 font-black text-sm uppercase text-gray-500", children: "PAS" })] })] }), status === 'success' ? (_jsxs("div", { className: "bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 text-center space-y-4", children: [_jsx("div", { className: "text-emerald-400 font-black uppercase tracking-widest text-sm", children: "\u2726 Transaction Confirmed" }), _jsx("button", { onClick: handleReset, className: "text-gray-500 text-[10px] font-bold uppercase underline hover:text-white", children: "Send Another" })] })) : (_jsx("button", { onClick: handleSend, disabled: !canSend, className: `w-full py-5 rounded-2xl font-black uppercase tracking-widest text-sm transition-all ${canSend ? 'bg-polkadot-pink text-white shadow-lg' : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`, children: status === 'signing' ? 'Check MetaMask...' : status === 'mining' ? 'Mining on Paseo...' : 'Send PAS Token' })), errMsg && _jsx("div", { className: "text-red-400 text-[10px] font-black uppercase text-center", children: errMsg })] })] }), _jsx("div", { className: "lg:col-span-4 space-y-6", children: _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-3xl p-6 space-y-4", children: [_jsx("h3", { className: "text-[10px] text-gray-500 font-black uppercase tracking-widest", children: "Network Info" }), _jsx("div", { className: "space-y-3", children: [['Network', 'Paseo'], ['ID', pasTestnet.id.toString()], ['Symbol', 'PAS']].map(([k, v]) => (_jsxs("div", { className: "flex justify-between items-center text-[10px] font-bold", children: [_jsx("span", { className: "text-gray-600 uppercase", children: k }), _jsx("span", { className: "font-mono text-gray-300", children: v })] }, k))) })] }) })] })] }));
}
