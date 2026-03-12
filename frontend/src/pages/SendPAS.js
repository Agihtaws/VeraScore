import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useCallback, useEffect } from 'react';
import { useAccount, useBalance, useSendTransaction, useWaitForTransactionReceipt, useChainId, useSwitchChain, } from 'wagmi';
import { parseEther, isAddress } from 'viem';
import { pasTestnet, SCORE_NFT_PROXY } from '../utils/wagmi';
const EXPLORER = 'https://polkadot.testnet.routescan.io';
export function SendPAS({ onSuccess } = {}) {
    const { address, isConnected } = useAccount();
    const chainId = useChainId();
    const { switchChain } = useSwitchChain();
    const isWrongNetwork = isConnected && chainId !== pasTestnet.id;
    const { data: balData, refetch: refetchBal } = useBalance({
        address, chainId: pasTestnet.id, query: { refetchInterval: 10_000 },
    });
    const balance = balData ? Number(balData.value) / 1e18 : 0;
    const [to, setTo] = useState('');
    const [amount, setAmount] = useState('');
    const [status, setStatus] = useState('idle');
    const [txHash, setTxHash] = useState();
    const [errMsg, setErrMsg] = useState('');
    const { sendTransactionAsync } = useSendTransaction();
    const { isSuccess: isConfirmed, isError: isFailed, error: receiptError } = useWaitForTransactionReceipt({
        hash: txHash, chainId: pasTestnet.id,
        query: { enabled: !!txHash && status === 'mining' },
    });
    useEffect(() => {
        if (isConfirmed && status === 'mining') {
            setStatus('success');
            refetchBal();
            onSuccess?.();
        }
    }, [isConfirmed, status, refetchBal, onSuccess]);
    useEffect(() => {
        if (isFailed && status === 'mining') {
            setStatus('error');
            const msg = receiptError?.message ?? 'Transaction failed on-chain.';
            setErrMsg(msg.length > 140 ? msg.slice(0, 140) + '…' : msg);
        }
    }, [isFailed, status, receiptError]);
    const toValid = to.trim() !== '' && isAddress(to.trim());
    const amtNum = parseFloat(amount);
    const amtValid = !isNaN(amtNum) && amtNum > 0 && amtNum <= balance;
    const canSend = isConnected && !isWrongNetwork && toValid && amtValid && status === 'idle';
    const setMax = () => setAmount(Math.max(0, balance - 0.001).toFixed(6));
    const handleSend = useCallback(async () => {
        if (!canSend)
            return;
        setStatus('signing');
        setErrMsg('');
        setTxHash(undefined);
        try {
            const hash = await sendTransactionAsync({
                to: to.trim(), value: parseEther(amount), chainId: pasTestnet.id,
            });
            setTxHash(hash);
            setStatus('mining');
        }
        catch (err) {
            const msg = err?.message ?? 'Unknown error';
            setErrMsg(msg.includes('User rejected') || msg.includes('rejected') ? 'Transaction rejected in MetaMask.'
                : msg.includes('insufficient') ? 'Insufficient PAS balance for gas.'
                    : msg.length > 140 ? msg.slice(0, 140) + '…' : msg);
            setStatus('error');
        }
    }, [canSend, to, amount, sendTransactionAsync]);
    const reset = () => { setStatus('idle'); setTxHash(undefined); setErrMsg(''); setTo(''); setAmount(''); };
    return (_jsxs("div", { className: "max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-xl font-black tracking-tight text-white", children: ["Send ", _jsx("span", { className: "text-polkadot-pink", children: "PAS" })] }), _jsx("p", { className: "text-[10px] text-gray-600 mt-0.5 font-medium", children: "Native token transfer \u00B7 Polkadot Hub TestNet" })] }), isWrongNetwork && (_jsxs("div", { className: "flex items-center justify-between bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-4 py-3", children: [_jsx("span", { className: "text-xs font-semibold text-yellow-400", children: "\u26A0 Switch to Polkadot Hub TestNet" }), _jsx("button", { onClick: () => switchChain({ chainId: pasTestnet.id }), className: "shrink-0 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 font-bold text-xs px-3 py-1.5 rounded-lg transition-all ml-3", children: "Switch" })] })), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden shadow-xl", children: [_jsxs("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20 flex items-center justify-between", children: [_jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-gray-500", children: "Transfer Details" }), isConnected && (_jsxs("span", { className: "text-[9px] font-black font-mono text-polkadot-pink", children: [balance.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }), " PAS"] }))] }), _jsxs("div", { className: "px-4 py-4 space-y-4", children: [_jsxs("div", { className: "space-y-1.5", children: [_jsx("div", { className: "text-[8px] font-bold uppercase tracking-widest text-gray-700", children: "From" }), _jsxs("div", { className: "bg-black/30 border border-white/5 rounded-xl px-4 py-2.5 flex items-center gap-2", children: [_jsx("span", { className: `w-1.5 h-1.5 rounded-full shrink-0 ${isConnected ? 'bg-emerald-500' : 'bg-gray-700'}` }), _jsx("span", { className: "font-mono text-xs text-gray-500 truncate flex-1", children: isConnected ? address : 'Not connected' })] })] }), _jsx("div", { className: "flex justify-center", children: _jsx("div", { className: "w-7 h-7 rounded-lg border border-polkadot-border bg-black/30 flex items-center justify-center text-polkadot-pink text-xs font-black", children: "\u2193" }) }), _jsxs("div", { className: "space-y-1.5", children: [_jsx("div", { className: "text-[8px] font-bold uppercase tracking-widest text-gray-700", children: "To Address" }), _jsx("input", { type: "text", value: to, onChange: e => setTo(e.target.value), placeholder: "0x\u2026", disabled: status === 'signing' || status === 'mining', className: `w-full bg-polkadot-dark border rounded-xl px-4 py-2.5 text-xs font-mono text-white placeholder-gray-700 outline-none transition-colors ${to && !toValid ? 'border-red-500/40'
                                            : to && toValid ? 'border-emerald-500/30'
                                                : 'border-polkadot-border focus:border-polkadot-pink/40'}` }), to && !toValid && (_jsx("p", { className: "text-[9px] font-bold text-red-400", children: "\u2717 Invalid EVM address" }))] }), _jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("div", { className: "text-[8px] font-bold uppercase tracking-widest text-gray-700", children: "Amount" }), isConnected && (_jsx("button", { onClick: setMax, className: "text-[9px] font-bold uppercase tracking-widest text-polkadot-pink hover:opacity-70 transition-opacity", children: "Max" }))] }), _jsxs("div", { className: `flex items-center bg-polkadot-dark border rounded-xl overflow-hidden transition-colors ${amount && !amtValid ? 'border-red-500/40'
                                            : amount && amtValid ? 'border-emerald-500/30'
                                                : 'border-polkadot-border focus-within:border-polkadot-pink/40'}`, children: [_jsx("input", { type: "number", value: amount, onChange: e => setAmount(e.target.value), placeholder: "0.0", min: "0", step: "0.001", disabled: status === 'signing' || status === 'mining', className: "flex-1 bg-transparent px-4 py-2.5 text-sm font-mono text-white placeholder-gray-700 outline-none" }), _jsx("span", { className: "px-4 text-[9px] font-black uppercase tracking-widest text-gray-700 border-l border-polkadot-border", children: "PAS" })] }), amount && !amtValid && amtNum > balance && (_jsx("p", { className: "text-[9px] font-bold text-red-400", children: "\u2717 Insufficient balance" })), amount && amtValid && (_jsxs("p", { className: "text-[9px] text-gray-700", children: ["Remaining: ", _jsxs("span", { className: "text-gray-600", children: [(balance - amtNum).toFixed(4), " PAS"] })] }))] }), status === 'signing' && (_jsxs("div", { className: "flex items-center gap-2.5 bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-4 py-2.5", children: [_jsx("span", { className: "w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin shrink-0" }), _jsx("span", { className: "text-[9px] font-bold uppercase tracking-widest text-yellow-400", children: "Check MetaMask\u2026" })] })), status === 'mining' && (_jsxs("div", { className: "flex items-center gap-2.5 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-2.5", children: [_jsx("span", { className: "w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" }), _jsx("span", { className: "text-[9px] font-bold uppercase tracking-widest text-blue-400 flex-1", children: "Mining on Hub\u2026" }), txHash && (_jsx("a", { href: `${EXPLORER}/tx/${txHash}`, target: "_blank", rel: "noopener noreferrer", className: "text-[9px] font-bold uppercase text-gray-600 hover:text-polkadot-pink transition-colors shrink-0", children: "View \u2197" }))] })), status === 'success' && (_jsxs("div", { className: "bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3 space-y-1.5", children: [_jsx("div", { className: "text-[9px] font-bold uppercase tracking-widest text-emerald-400", children: "\u2713 Confirmed" }), txHash && (_jsxs("a", { href: `${EXPLORER}/tx/${txHash}`, target: "_blank", rel: "noopener noreferrer", className: "block font-mono text-[9px] text-gray-600 hover:text-polkadot-pink truncate transition-colors", children: [txHash, " \u2197"] })), _jsx("button", { onClick: reset, className: "text-[9px] font-bold uppercase tracking-widest text-gray-600 hover:text-gray-400 transition-colors", children: "Send Another \u2192" })] })), status === 'error' && (_jsxs("div", { className: "bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3 space-y-1.5", children: [_jsxs("div", { className: "text-[9px] font-bold uppercase tracking-widest text-red-400", children: ["\u2717 ", errMsg] }), _jsx("button", { onClick: reset, className: "text-[9px] font-bold uppercase tracking-widest text-gray-600 hover:text-gray-400 transition-colors", children: "Try Again \u2192" })] })), status !== 'success' && (_jsx("button", { onClick: handleSend, disabled: !canSend, className: "w-full py-3 bg-polkadot-pink hover:bg-pink-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_12px_rgba(230,0,122,0.2)]", children: !isConnected ? 'Connect Wallet to Send'
                                    : isWrongNetwork ? 'Switch to PAS TestNet'
                                        : status === 'signing' ? 'Confirm in MetaMask…'
                                            : status === 'mining' ? 'Confirming On-Chain…'
                                                : 'Send PAS' }))] })] }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: [_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsx("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20", children: _jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-gray-500", children: "Network" }) }), _jsx("div", { className: "grid grid-cols-1 gap-px bg-polkadot-border", children: [
                                    ['Name', pasTestnet.name],
                                    ['Chain ID', pasTestnet.id.toString()],
                                    ['Token', `${pasTestnet.nativeCurrency.name} (${pasTestnet.nativeCurrency.symbol})`],
                                    ['Decimals', pasTestnet.nativeCurrency.decimals.toString()],
                                ].map(([k, v]) => (_jsxs("div", { className: "bg-polkadot-card px-4 py-2.5 flex justify-between items-center gap-3", children: [_jsx("span", { className: "text-[8px] font-bold uppercase tracking-widest text-gray-700 shrink-0", children: k }), _jsx("span", { className: "text-[9px] font-mono text-gray-500 text-right break-all", children: v })] }, k))) })] }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsx("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20", children: _jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-gray-500", children: "Tips" }) }), _jsx("div", { className: "px-4 py-3 space-y-2", children: [
                                            'Keep ~0.001 PAS for gas.',
                                            'Confirms in ~6–12 s on PAS TestNet.',
                                            'EVM-format addresses only (0x…).',
                                        ].map((tip, i) => (_jsxs("div", { className: "flex gap-2", children: [_jsx("span", { className: "text-polkadot-pink font-black text-[9px] shrink-0", children: "\u2192" }), _jsx("span", { className: "text-[9px] text-gray-600 leading-relaxed", children: tip })] }, i))) })] }), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsx("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20", children: _jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-gray-500", children: "Contracts" }) }), _jsx("div", { className: "px-4 py-3 space-y-2", children: [
                                            ['ScoreNFT', SCORE_NFT_PROXY],
                                            ['Lending', import.meta.env.VITE_LENDING_POOL],
                                        ].filter(([, addr]) => addr).map(([label, addr]) => (_jsxs("div", { children: [_jsx("div", { className: "text-[8px] font-bold uppercase tracking-widest text-gray-700", children: label }), _jsxs("a", { href: `${EXPLORER}/address/${addr}`, target: "_blank", rel: "noopener noreferrer", className: "font-mono text-[9px] text-gray-600 hover:text-polkadot-pink transition-colors break-all", children: [addr, " \u2197"] })] }, label))) })] })] })] })] }));
}
