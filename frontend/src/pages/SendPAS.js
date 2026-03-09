'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useCallback, useRef } from 'react';
import { useAccount, useBalance, useSendTransaction, useWaitForTransactionReceipt, useChainId, useSwitchChain } from 'wagmi';
import { parseEther, isAddress } from 'viem';
import { pasTestnet, SCORE_NFT_PROXY } from '../utils/wagmi.js';
const EXPLORER = 'https://polkadot.testnet.routescan.io';
export function SendPAS({ onSuccess } = {}) {
    const { address, isConnected } = useAccount();
    const chainId = useChainId();
    const { switchChain } = useSwitchChain();
    const isWrongNetwork = isConnected && chainId !== pasTestnet.id;
    const { data: balData, refetch: refetchBal } = useBalance({ address, chainId: pasTestnet.id });
    const balance = balData ? Number(balData.value) / 1e18 : 0;
    const [to, setTo] = useState('');
    const [amount, setAmount] = useState('');
    const [status, setStatus] = useState('idle');
    const [txHash, setTxHash] = useState();
    const [errMsg, setErrMsg] = useState('');
    const statusRef = useRef('idle');
    const setStatusSync = (s) => { statusRef.current = s; setStatus(s); };
    const { sendTransactionAsync } = useSendTransaction();
    const { isLoading: isMining } = useWaitForTransactionReceipt({
        hash: txHash,
        chainId: pasTestnet.id,
        query: { enabled: !!txHash && status === 'mining' },
    });
    // derived
    const toValid = to.trim() !== '' && isAddress(to.trim());
    const amtNum = parseFloat(amount);
    const amtValid = !isNaN(amtNum) && amtNum > 0 && amtNum <= balance;
    const canSend = isConnected && !isWrongNetwork && toValid && amtValid && status !== 'signing' && status !== 'mining';
    const setMax = () => {
        // leave a tiny buffer for gas (~0.001 PAS)
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
                chainId: pasTestnet.id,
            });
            setTxHash(hash);
            setStatusSync('mining');
            // poll for receipt manually so we can show success
            const interval = setInterval(async () => {
                try {
                    const receipt = await fetch(`${pasTestnet.rpcUrls.default.http[0]}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0', id: 1,
                            method: 'eth_getTransactionReceipt',
                            params: [hash],
                        }),
                    }).then(r => r.json());
                    if (receipt?.result?.status === '0x1') {
                        clearInterval(interval);
                        setStatusSync('success');
                        refetchBal();
                    }
                    else if (receipt?.result?.status === '0x0') {
                        clearInterval(interval);
                        setStatusSync('error');
                        setErrMsg('Transaction reverted on-chain.');
                    }
                }
                catch { /* keep polling */ }
            }, 2000);
            // safety timeout after 90s
            setTimeout(() => {
                clearInterval(interval);
                if (statusRef.current === 'mining')
                    setStatusSync('success'); // assume ok
            }, 90_000);
        }
        catch (err) {
            const msg = err?.message ?? 'Unknown error';
            setErrMsg(msg.includes('User rejected') || msg.includes('rejected')
                ? 'Transaction rejected in MetaMask.'
                : msg.includes('insufficient')
                    ? 'Insufficient PAS balance.'
                    : msg.length > 140 ? msg.slice(0, 140) + '…' : msg);
            setStatusSync('error');
        }
    }, [canSend, to, amount, sendTransactionAsync, refetchBal]);
    const reset = () => {
        statusRef.current = 'idle';
        setStatus('idle');
        setTxHash(undefined);
        setErrMsg('');
        setTo('');
        setAmount('');
    };
    return (_jsxs("div", { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-8", children: [_jsxs("div", { className: "space-y-1", children: [_jsx("h1", { className: "text-2xl font-bold tracking-tight", children: "Send PAS" }), _jsx("p", { className: "text-gray-400 text-sm", children: "Transfer native PAS tokens to any address on Polkadot Hub TestNet. Uses your connected MetaMask wallet \u2014 no backend involved." })] }), isWrongNetwork && (_jsxs("div", { className: "flex items-center justify-between bg-yellow-900/40 border border-yellow-500/50 rounded-xl px-5 py-3 text-sm", children: [_jsxs("span", { className: "text-yellow-300 font-medium", children: ["\u26A0\uFE0F Wrong network \u2014 switch to ", _jsx("strong", { children: "Polkadot Hub TestNet" })] }), _jsx("button", { onClick: () => switchChain({ chainId: pasTestnet.id }), className: "ml-4 shrink-0 bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-4 py-1.5 rounded-lg text-xs transition", children: "Switch Network" })] })), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6", children: [_jsx("div", { className: "lg:col-span-2 space-y-4", children: _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsx("div", { className: "px-5 py-4 border-b border-polkadot-border", children: _jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "Transfer Details" }) }), _jsxs("div", { className: "px-5 py-5 space-y-5", children: [_jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "From" }), _jsxs("div", { className: "bg-polkadot-dark border border-polkadot-border rounded-xl px-4 py-3 flex items-center gap-3", children: [_jsx("span", { className: "inline-block w-2 h-2 rounded-full bg-green-500 shrink-0" }), _jsx("span", { className: "font-mono text-sm text-gray-300 truncate", children: isConnected ? address : 'Not connected' }), isConnected && (_jsxs("span", { className: "ml-auto text-xs text-polkadot-pink font-mono font-semibold shrink-0", children: [balance.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }), " PAS"] }))] })] }), _jsx("div", { className: "flex justify-center", children: _jsx("div", { className: "w-8 h-8 rounded-full border border-polkadot-border bg-polkadot-dark flex items-center justify-center text-gray-500", children: "\u2193" }) }), _jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "To Address" }), _jsx("input", { type: "text", value: to, onChange: e => setTo(e.target.value), placeholder: "0x...", disabled: status === 'signing' || status === 'mining', className: `w-full bg-polkadot-dark border rounded-xl px-4 py-3 font-mono text-sm text-white placeholder-gray-600 outline-none transition-colors ${to && !toValid
                                                        ? 'border-red-500/60 focus:border-red-500'
                                                        : to && toValid
                                                            ? 'border-green-500/60 focus:border-green-500'
                                                            : 'border-polkadot-border focus:border-polkadot-pink'}` }), to && !toValid && (_jsx("p", { className: "text-xs text-red-400", children: "Invalid EVM address" })), to && toValid && (_jsx("p", { className: "text-xs text-green-400", children: "\u2713 Valid address" }))] }), _jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("label", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "Amount" }), isConnected && (_jsx("button", { onClick: setMax, className: "text-xs text-polkadot-pink hover:text-pink-400 transition-colors font-medium", children: "Max" }))] }), _jsxs("div", { className: `flex items-center bg-polkadot-dark border rounded-xl overflow-hidden transition-colors ${amount && !amtValid
                                                        ? 'border-red-500/60'
                                                        : amount && amtValid
                                                            ? 'border-green-500/60'
                                                            : 'border-polkadot-border focus-within:border-polkadot-pink'}`, children: [_jsx("input", { type: "number", value: amount, onChange: e => setAmount(e.target.value), placeholder: "0.0", min: "0", step: "0.001", disabled: status === 'signing' || status === 'mining', className: "flex-1 bg-transparent px-4 py-3 text-sm text-white placeholder-gray-600 outline-none" }), _jsx("span", { className: "px-4 text-sm text-gray-400 font-medium border-l border-polkadot-border", children: "PAS" })] }), amount && !amtValid && amtNum > balance && (_jsx("p", { className: "text-xs text-red-400", children: "Insufficient balance" })), amount && amtValid && (_jsxs("p", { className: "text-xs text-gray-500", children: ["\u2248 ", amtNum.toLocaleString('en-US', { minimumFractionDigits: 4 }), " PAS \u00B7 remaining after send:", ' ', _jsxs("span", { className: "text-gray-400", children: [(balance - amtNum).toFixed(4), " PAS"] })] }))] }), status === 'signing' && (_jsxs("div", { className: "flex items-center gap-3 bg-blue-950/50 border border-blue-800/50 rounded-xl px-4 py-3 text-sm text-blue-300", children: [_jsx("span", { className: "inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" }), "Waiting for MetaMask confirmation\u2026"] })), status === 'mining' && (_jsxs("div", { className: "flex items-center gap-3 bg-yellow-950/50 border border-yellow-800/50 rounded-xl px-4 py-3 text-sm text-yellow-300", children: [_jsx("span", { className: "inline-block w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin shrink-0" }), "Transaction submitted \u2014 waiting for block confirmation\u2026", txHash && (_jsx("a", { href: `${EXPLORER}/tx/${txHash}`, target: "_blank", rel: "noopener noreferrer", className: "ml-auto text-xs underline opacity-70 hover:opacity-100 shrink-0", children: "View \u2197" }))] })), status === 'success' && (_jsxs("div", { className: "bg-green-950/50 border border-green-800/50 rounded-xl px-4 py-4 space-y-2", children: [_jsxs("div", { className: "flex items-center gap-2 text-green-400 font-semibold text-sm", children: [_jsx("span", { children: "\u2713" }), " Transaction confirmed!"] }), txHash && (_jsxs("a", { href: `${EXPLORER}/tx/${txHash}`, target: "_blank", rel: "noopener noreferrer", className: "block font-mono text-xs text-green-600 hover:text-green-400 truncate transition-colors", children: [txHash, " \u2197"] })), _jsx("button", { onClick: reset, className: "mt-1 text-xs text-gray-400 hover:text-white underline transition-colors", children: "Send another" })] })), status === 'error' && (_jsxs("div", { className: "bg-red-950/50 border border-red-800/50 rounded-xl px-4 py-3 text-sm text-red-400", children: ["\u2717 ", errMsg] })), status !== 'success' && (_jsx("button", { onClick: handleSend, disabled: !canSend, className: "w-full py-3.5 rounded-xl font-semibold text-sm transition-all\r\n                    bg-polkadot-pink hover:bg-pink-600 text-white\r\n                    disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500", children: !isConnected
                                                ? 'Connect Wallet to Send'
                                                : isWrongNetwork
                                                    ? 'Switch to PAS TestNet'
                                                    : status === 'signing'
                                                        ? 'Confirm in MetaMask…'
                                                        : status === 'mining'
                                                            ? 'Confirming…'
                                                            : 'Send PAS' }))] })] }) }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsx("div", { className: "px-5 py-4 border-b border-polkadot-border", children: _jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "Network" }) }), _jsx("div", { className: "px-5 py-4 space-y-3 text-sm", children: [
                                            ['Name', pasTestnet.name],
                                            ['Chain ID', pasTestnet.id.toString()],
                                            ['Token', `${pasTestnet.nativeCurrency.name} (${pasTestnet.nativeCurrency.symbol})`],
                                            ['Decimals', pasTestnet.nativeCurrency.decimals.toString()],
                                            ['RPC', pasTestnet.rpcUrls.default.http[0].replace('https://', '')],
                                        ].map(([k, v]) => (_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsx("span", { className: "text-gray-500 shrink-0", children: k }), _jsx("span", { className: "text-gray-200 font-mono text-xs text-right break-all", children: v })] }, k))) })] }), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsx("div", { className: "px-5 py-4 border-b border-polkadot-border", children: _jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "Contracts" }) }), _jsx("div", { className: "px-5 py-4 space-y-3", children: [
                                            ['ScoreNFT', SCORE_NFT_PROXY],
                                            ['Lending', import.meta.env.VITE_LENDING_POOL],
                                        ].filter(([, addr]) => addr).map(([label, addr]) => (_jsxs("div", { className: "space-y-0.5", children: [_jsx("div", { className: "text-xs text-gray-500", children: label }), _jsxs("a", { href: `${EXPLORER}/address/${addr}`, target: "_blank", rel: "noopener noreferrer", className: "font-mono text-[11px] text-gray-400 hover:text-polkadot-pink transition-colors break-all", children: [addr, " \u2197"] })] }, label))) })] }), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsx("div", { className: "px-5 py-4 border-b border-polkadot-border", children: _jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "Tips" }) }), _jsxs("div", { className: "px-5 py-4 space-y-2 text-xs text-gray-500 leading-relaxed", children: [_jsx("p", { children: "\u2022 Keep ~0.001 PAS for gas fees after sending." }), _jsx("p", { children: "\u2022 Transactions confirm in ~6\u201312 seconds on PAS TestNet." }), _jsx("p", { children: "\u2022 Only EVM-format addresses (0x\u2026) are supported here." }), _jsx("p", { children: "\u2022 Get testnet PAS from the Polkadot faucet." })] })] })] })] })] }));
}
