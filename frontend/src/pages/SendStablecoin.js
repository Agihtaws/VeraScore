'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useCallback, useRef, useEffect } from 'react';
import { useAccount, useWriteContract, useChainId, useSwitchChain } from 'wagmi';
import { isAddress, parseUnits, getAddress } from 'viem';
import { pasTestnet, USDT_ERC20, USDC_ERC20 } from '../utils/wagmi.js';
const EXPLORER = 'https://polkadot.testnet.routescan.io';
const RPC_URL = 'https://services.polkadothub-rpc.com/testnet';
const ERC20_ABI = [
    {
        name: 'transfer',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
        outputs: [{ name: '', type: 'bool' }],
    },
];
const TOKEN_CONFIG = {
    USDT: {
        address: getAddress(USDT_ERC20),
        assetId: 1984,
        decimals: 6,
        color: 'text-emerald-400',
        bg: 'bg-emerald-950/40',
        border: 'border-emerald-700/40',
        dot: 'bg-emerald-400',
        explorer: `${EXPLORER}/token/0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF07C0`,
    },
    USDC: {
        address: getAddress(USDC_ERC20),
        assetId: 1337,
        decimals: 6,
        color: 'text-blue-400',
        bg: 'bg-blue-950/40',
        border: 'border-blue-700/40',
        dot: 'bg-blue-400',
        explorer: `${EXPLORER}/token/0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0539`,
    },
};
// ── Poll receipt until confirmed/reverted ─────────────────────────────────────
async function pollReceipt(hash) {
    for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 3_000));
        try {
            const res = await fetch(RPC_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0', id: 1,
                    method: 'eth_getTransactionReceipt',
                    params: [hash],
                }),
                signal: AbortSignal.timeout(8_000),
            });
            const json = await res.json();
            console.log(`[SendStablecoin] poll #${i + 1}:`, json.result
                ? `block=${json.result.blockNumber} status=${json.result.status}`
                : 'null');
            if (json.result?.blockNumber) {
                return json.result.status === '0x1' ? 'confirmed' : 'reverted';
            }
        }
        catch (e) {
            console.warn(`[SendStablecoin] poll #${i + 1} error:`, e);
        }
    }
    console.warn('[SendStablecoin] poll timeout — assuming confirmed');
    return 'confirmed';
}
// ── Fetch USDT/USDC from /balances endpoint (Sidecar REST → PAPI fallback) ────
async function fetchStableBalances(address) {
    console.log('[SendStablecoin] fetchStableBalances →', address);
    try {
        const res = await fetch(`/balances/${address}`);
        const json = await res.json();
        console.log(`[SendStablecoin] /balances → success=${json.success} usdt=${json.usdt} usdc=${json.usdc} source=${json.source ?? 'n/a'}`);
        if (!json.success) {
            console.warn('[SendStablecoin] balance fetch failed:', json.error);
            return { usdt: 0, usdc: 0 };
        }
        return { usdt: json.usdt, usdc: json.usdc };
    }
    catch (e) {
        console.error('[SendStablecoin] fetchStableBalances error:', e);
        return { usdt: 0, usdc: 0 };
    }
}
// ── Component ─────────────────────────────────────────────────────────────────
export function SendStablecoin() {
    const { address, isConnected } = useAccount();
    const chainId = useChainId();
    const { switchChain } = useSwitchChain();
    const isWrongNetwork = isConnected && chainId !== pasTestnet.id;
    const [token, setToken] = useState('USDT');
    const [to, setTo] = useState('');
    const [amount, setAmount] = useState('');
    const [status, setStatus] = useState('idle');
    const [txHash, setTxHash] = useState();
    const [errMsg, setErrMsg] = useState('');
    const [balances, setBalances] = useState(null);
    const [balLoading, setBalLoading] = useState(false);
    const statusRef = useRef('idle');
    const pauseUntil = useRef(0);
    const cfg = TOKEN_CONFIG[token];
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
        const doFetch = (label) => {
            if (Date.now() < pauseUntil.current) {
                console.log(`[SendStablecoin] ${label} skipped — pause active for`, Math.ceil((pauseUntil.current - Date.now()) / 1000), 's');
                return;
            }
            console.log(`[SendStablecoin] ${label}: fetching...`);
            fetchStableBalances(address).then(b => {
                if (cancelled)
                    return;
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
    const handleTokenSwitch = (t) => {
        setToken(t);
        setAmount('');
        setTo('');
        statusRef.current = 'idle';
        setStatus('idle');
        setErrMsg('');
        setTxHash(undefined);
    };
    // ── Validation ──────────────────────────────────────────────────────────────
    const toValid = to.trim() !== '' && isAddress(to.trim());
    const amtNum = parseFloat(amount);
    const amtValid = !isNaN(amtNum) && amtNum > 0;
    const amtInsufficient = balance !== null && amtValid && amtNum > balance;
    const canSend = isConnected
        && !isWrongNetwork
        && toValid
        && amtValid
        && !amtInsufficient
        && balance !== null
        && statusRef.current !== 'signing'
        && statusRef.current !== 'mining';
    const setMax = () => {
        if (balance !== null && balance > 0)
            setAmount(balance.toFixed(6));
    };
    // ── Write contract ──────────────────────────────────────────────────────────
    const { writeContractAsync } = useWriteContract();
    const handleSend = useCallback(async () => {
        if (!canSend || !address)
            return;
        console.log('[SendStablecoin] handleSend — token:', token, 'to:', to, 'amount:', amount, 'balance:', balance);
        statusRef.current = 'signing';
        setStatus('signing');
        setErrMsg('');
        setTxHash(undefined);
        try {
            console.log('[SendStablecoin] writeContractAsync on precompile:', cfg.address);
            const hash = await writeContractAsync({
                address: cfg.address,
                abi: ERC20_ABI,
                functionName: 'transfer',
                args: [to.trim(), parseUnits(amount, cfg.decimals)],
                chainId: pasTestnet.id,
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
                    if (!prev)
                        return prev;
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
            }
            else {
                statusRef.current = 'error';
                setStatus('error');
                setErrMsg('Transaction reverted on-chain. Check your balance and try again.');
            }
        }
        catch (err) {
            const msg = err?.message ?? 'Unknown error';
            setErrMsg(msg.includes('User rejected') || msg.includes('rejected')
                ? 'Transaction rejected in MetaMask.'
                : msg.includes('insufficient') || msg.includes('balance')
                    ? `Insufficient ${token} balance.`
                    : msg.length > 160
                        ? msg.slice(0, 160) + '…'
                        : msg);
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
    return (_jsxs("div", { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-8", children: [_jsxs("div", { className: "space-y-1", children: [_jsx("h1", { className: "text-2xl font-bold tracking-tight", children: "Send Stablecoins" }), _jsx("p", { className: "text-gray-400 text-sm", children: "Transfer USDT or USDC on Polkadot Hub TestNet via native Assets pallet ERC-20 precompile. Gas is paid in PAS \u2014 no bridging required." })] }), isWrongNetwork && (_jsxs("div", { className: "flex items-center justify-between bg-yellow-900/40 border border-yellow-500/50 rounded-xl px-5 py-3 text-sm", children: [_jsxs("span", { className: "text-yellow-300 font-medium", children: ["\u26A0\uFE0F Wrong network \u2014 switch to ", _jsx("strong", { children: "Polkadot Hub TestNet" })] }), _jsx("button", { onClick: () => switchChain({ chainId: pasTestnet.id }), className: "ml-4 shrink-0 bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-4 py-1.5 rounded-lg text-xs transition", children: "Switch Network" })] })), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6", children: [_jsx("div", { className: "lg:col-span-2 space-y-4", children: _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsx("div", { className: "px-5 pt-5 pb-0 flex gap-2", children: ['USDT', 'USDC'].map(t => {
                                        const c = TOKEN_CONFIG[t];
                                        return (_jsxs("button", { onClick: () => handleTokenSwitch(t), className: `flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${token === t
                                                ? `${c.bg} ${c.border} ${c.color}`
                                                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300'}`, children: [_jsx("span", { className: `w-2 h-2 rounded-full ${c.dot}` }), t] }, t));
                                    }) }), _jsxs("div", { className: "px-5 py-5 space-y-5", children: [_jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "From" }), _jsxs("div", { className: "bg-polkadot-dark border border-polkadot-border rounded-xl px-4 py-3 flex items-center gap-3", children: [_jsx("span", { className: `w-2 h-2 rounded-full shrink-0 ${isConnected ? cfg.dot : 'bg-gray-600'}` }), _jsx("span", { className: "font-mono text-sm text-gray-300 truncate flex-1", children: isConnected ? address : 'Not connected' }), isConnected && (_jsx("span", { className: `text-xs font-mono font-semibold shrink-0 ${balance !== null && balance > 0 ? cfg.color : 'text-gray-500'}`, children: balLoading && balance === null
                                                                ? 'Loading…'
                                                                : balance !== null
                                                                    ? `${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${token}`
                                                                    : `0.00 ${token}` }))] })] }), _jsx("div", { className: "flex justify-center", children: _jsx("div", { className: "w-8 h-8 rounded-full border border-polkadot-border bg-polkadot-dark flex items-center justify-center text-gray-500", children: "\u2193" }) }), _jsxs("div", { className: "space-y-1.5", children: [_jsx("label", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "To Address" }), _jsx("input", { type: "text", value: to, onChange: e => setTo(e.target.value), placeholder: "0x\u2026", spellCheck: false, disabled: status === 'signing' || status === 'mining', className: `w-full bg-polkadot-dark border rounded-xl px-4 py-3 text-sm font-mono
                    placeholder-gray-600 outline-none transition-colors ${to && !toValid
                                                        ? 'border-red-500/60 text-red-400'
                                                        : to && toValid
                                                            ? 'border-green-500/60 text-gray-200'
                                                            : 'border-polkadot-border text-gray-200 focus:border-polkadot-pink/60'}` }), to && !toValid && (_jsx("p", { className: "text-xs text-red-400", children: "Invalid EVM address" }))] }), _jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("label", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "Amount" }), isConnected && balance !== null && balance > 0 && (_jsx("button", { onClick: setMax, className: `text-xs font-medium transition-colors hover:opacity-80 ${cfg.color}`, children: "Max" }))] }), _jsxs("div", { className: `flex items-center bg-polkadot-dark border rounded-xl overflow-hidden transition-colors ${amtInsufficient
                                                        ? 'border-red-500/60'
                                                        : amount && amtValid
                                                            ? 'border-green-500/60'
                                                            : 'border-polkadot-border focus-within:border-polkadot-pink/60'}`, children: [_jsx("input", { type: "number", value: amount, onChange: e => setAmount(e.target.value), placeholder: "0.00", min: "0", step: "0.01", disabled: status === 'signing' || status === 'mining', className: "flex-1 bg-transparent px-4 py-3 text-sm text-white placeholder-gray-600 outline-none" }), _jsx("span", { className: `px-4 text-sm font-semibold border-l border-polkadot-border ${cfg.color}`, children: token })] }), amtInsufficient && (_jsxs("p", { className: "text-xs text-red-400", children: ["Insufficient ", token, " balance"] })), amount && amtValid && !amtInsufficient && balance !== null && (_jsxs("p", { className: "text-xs text-gray-500", children: ["Remaining:", ' ', _jsxs("span", { className: "text-gray-400", children: [(balance - amtNum).toFixed(6), " ", token] })] }))] }), status === 'signing' && (_jsxs("div", { className: "flex items-center gap-3 bg-blue-950/50 border border-blue-800/50 rounded-xl px-4 py-3 text-sm text-blue-300", children: [_jsx("span", { className: "w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" }), "Waiting for MetaMask confirmation\u2026"] })), status === 'mining' && (_jsxs("div", { className: "flex items-center gap-3 bg-yellow-950/50 border border-yellow-800/50 rounded-xl px-4 py-3 text-sm text-yellow-300", children: [_jsx("span", { className: "w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin shrink-0" }), _jsx("span", { className: "flex-1", children: "Transaction submitted \u2014 waiting for block\u2026" }), txHash && (_jsx("a", { href: `${EXPLORER}/tx/${txHash}`, target: "_blank", rel: "noopener noreferrer", className: "text-xs underline opacity-70 hover:opacity-100 shrink-0", children: "View \u2197" }))] })), status === 'success' && (_jsxs("div", { className: "bg-green-950/50 border border-green-800/50 rounded-xl px-4 py-4 space-y-2", children: [_jsxs("div", { className: "flex items-center gap-2 text-green-400 font-semibold text-sm", children: [_jsx("span", { children: "\u2713" }), " ", token, " sent successfully!"] }), txHash && (_jsxs("a", { href: `${EXPLORER}/tx/${txHash}`, target: "_blank", rel: "noopener noreferrer", className: "block font-mono text-xs text-green-600 hover:text-green-400 truncate transition-colors", children: [txHash, " \u2197"] })), _jsx("button", { onClick: reset, className: "mt-1 text-xs text-gray-400 hover:text-white underline transition-colors", children: "Send another" })] })), status === 'error' && (_jsxs("div", { className: "bg-red-950/50 border border-red-800/50 rounded-xl px-4 py-3 text-sm text-red-400", children: ["\u2717 ", errMsg] })), status !== 'success' && (_jsx("button", { onClick: handleSend, disabled: !canSend, className: `w-full py-3.5 rounded-xl font-semibold text-sm transition-all
                    disabled:opacity-40 disabled:cursor-not-allowed
                    ${token === 'USDT'
                                                ? 'bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700'
                                                : 'bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700'} text-white disabled:text-gray-500`, children: !isConnected
                                                ? 'Connect Wallet to Send'
                                                : isWrongNetwork
                                                    ? 'Switch to PAS TestNet'
                                                    : status === 'signing'
                                                        ? 'Confirm in MetaMask…'
                                                        : status === 'mining'
                                                            ? 'Confirming…'
                                                            : `Send ${token}` }))] })] }) }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsx("div", { className: "px-5 py-4 border-b border-polkadot-border", children: _jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "How It Works" }) }), _jsxs("div", { className: "px-5 py-4 space-y-3 text-xs text-gray-400 leading-relaxed", children: [_jsxs("p", { children: ["USDT and USDC on Polkadot Hub are", ' ', _jsx("span", { className: "text-gray-200 font-medium", children: "native Assets pallet tokens" }), ". Polkadot Hub exposes them via ERC-20 precompile addresses so MetaMask can send them directly."] }), _jsxs("p", { children: ["Gas is always paid in", ' ', _jsx("span", { className: "text-gray-200 font-medium", children: "PAS" }), " \u2014 never ETH. This is a core advantage of building on Polkadot Hub."] }), _jsxs("p", { children: ["Balances are queried via", ' ', _jsx("span", { className: "text-gray-200 font-medium", children: "PAPI (Substrate)" }), " \u2014 the same source as the Score page."] })] })] }), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsx("div", { className: "px-5 py-4 border-b border-polkadot-border", children: _jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "Asset Info" }) }), _jsx("div", { className: "px-5 py-4 space-y-4", children: ['USDT', 'USDC'].map(t => {
                                            const c = TOKEN_CONFIG[t];
                                            return (_jsxs("div", { className: "space-y-1.5", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: `w-1.5 h-1.5 rounded-full ${c.dot}` }), _jsx("span", { className: `text-xs font-semibold ${c.color}`, children: t }), _jsxs("span", { className: "text-gray-600 text-xs", children: ["Asset ID ", c.assetId] })] }), _jsxs("a", { href: c.explorer, target: "_blank", rel: "noopener noreferrer", className: "block font-mono text-[10px] text-gray-600 hover:text-gray-400 break-all transition-colors", children: [c.address, " \u2197"] })] }, t));
                                        }) })] }), isConnected && (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsxs("div", { className: "px-5 py-4 border-b border-polkadot-border flex items-center justify-between", children: [_jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "Your Balances" }), balLoading && (_jsx("span", { className: "w-3 h-3 border border-gray-600 border-t-transparent rounded-full animate-spin" }))] }), _jsx("div", { className: "px-5 py-4 space-y-3", children: ['USDT', 'USDC'].map(t => {
                                            const c = TOKEN_CONFIG[t];
                                            const b = balances !== null
                                                ? (t === 'USDT' ? balances.usdt : balances.usdc)
                                                : null;
                                            return (_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: `w-1.5 h-1.5 rounded-full ${c.dot}` }), _jsx("span", { className: "text-xs text-gray-400", children: t })] }), _jsx("span", { className: `text-xs font-mono font-semibold ${b !== null && b > 0 ? c.color : 'text-gray-500'}`, children: b !== null
                                                            ? b.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
                                                            : balLoading ? '…' : '0.00' })] }, t));
                                        }) })] })), _jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsx("div", { className: "px-5 py-4 border-b border-polkadot-border", children: _jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "Tips" }) }), _jsxs("div", { className: "px-5 py-4 space-y-2 text-xs text-gray-500 leading-relaxed", children: [_jsx("p", { children: "\u2022 Keep ~0.001 PAS for gas fees." }), _jsx("p", { children: "\u2022 USDT = asset 1984, USDC = asset 1337 on Polkadot Hub." }), _jsx("p", { children: "\u2022 Transactions confirm in ~6\u201312 seconds." }), _jsx("p", { children: "\u2022 Only EVM-format (0x\u2026) addresses supported here." }), _jsx("p", { children: "\u2022 USDC is not deployed on PAS TestNet." })] })] })] })] })] }));
}
