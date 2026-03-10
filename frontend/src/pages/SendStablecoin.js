'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useCallback, useRef, useEffect } from 'react';
import { useAccount, useWriteContract, useChainId, useSwitchChain } from 'wagmi';
import { isAddress, parseUnits, getAddress } from 'viem';
import { pasTestnet, USDT_ERC20, USDC_ERC20 } from '../utils/wagmi';
const EXPLORER = 'https://polkadot.testnet.routescan.io';
// Using the fast RPC so transaction detection is instant pa!
const RPC_URL = 'https://pas-rpc.stakeworld.io/assethub';
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
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
        dot: 'bg-emerald-400',
        explorer: `${EXPLORER}/token/${USDT_ERC20}`,
    },
    USDC: {
        address: getAddress(USDC_ERC20),
        assetId: 1337,
        decimals: 6,
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/20',
        dot: 'bg-blue-400',
        explorer: `${EXPLORER}/token/${USDC_ERC20}`,
    },
};
async function pollReceipt(hash) {
    // 40 attempts x 3s = 2 mins max poll
    for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
            const res = await fetch(RPC_URL, {
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
        }
        catch (e) {
            console.warn(`[SendStablecoin] poll error:`, e);
        }
    }
    return 'confirmed'; // Fallback
}
async function fetchStableBalances(address) {
    try {
        const res = await fetch(`/balances/${address}`);
        const json = await res.json();
        if (!json.success)
            return { usdt: 0, usdc: 0 };
        return { usdt: json.usdt, usdc: json.usdc };
    }
    catch (e) {
        return { usdt: 0, usdc: 0 };
    }
}
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
    const pauseUntil = useRef(0);
    const cfg = TOKEN_CONFIG[token];
    const balance = balances !== null ? (token === 'USDT' ? balances.usdt : balances.usdc) : null;
    useEffect(() => {
        if (!isConnected || !address) {
            setBalances(null);
            return;
        }
        let cancelled = false;
        const doFetch = () => {
            if (Date.now() < pauseUntil.current || cancelled)
                return;
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
    const handleTokenSwitch = (t) => {
        setToken(t);
        setAmount('');
        setStatus('idle');
        setErrMsg('');
        setTxHash(undefined);
    };
    const toValid = to.trim() !== '' && isAddress(to.trim());
    const amtNum = parseFloat(amount);
    const amtValid = !isNaN(amtNum) && amtNum > 0;
    const amtInsufficient = balance !== null && amtValid && amtNum > balance;
    const canSend = isConnected && !isWrongNetwork && toValid && amtValid && !amtInsufficient && status === 'idle';
    const { writeContractAsync } = useWriteContract();
    const handleSend = useCallback(async () => {
        if (!canSend || !address)
            return;
        setStatus('signing');
        setErrMsg('');
        try {
            const hash = await writeContractAsync({
                address: cfg.address,
                abi: ERC20_ABI,
                functionName: 'transfer',
                args: [to.trim(), parseUnits(amount, cfg.decimals)],
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
            }
            else {
                setStatus('error');
                setErrMsg('Transaction reverted on-chain.');
            }
        }
        catch (err) {
            setErrMsg(err.message.includes('rejected') ? 'Transaction rejected.' : 'Transfer failed.');
            setStatus('error');
        }
    }, [canSend, address, cfg, to, amount, token, writeContractAsync]);
    return (_jsxs("div", { className: "max-w-4xl mx-auto px-4 py-12 space-y-10", children: [_jsxs("div", { className: "space-y-2", children: [_jsxs("h1", { className: "text-3xl font-black tracking-tighter uppercase italic text-white", children: ["Stablecoin ", _jsx("span", { className: "text-polkadot-pink text-4xl", children: "Transfer" })] }), _jsx("p", { className: "text-gray-500 text-sm font-medium uppercase tracking-widest", children: "Native Assets Pallet Precompiles \u00B7 Zero-Bridge Architecture" })] }), isWrongNetwork && (_jsxs("div", { className: "bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-amber-500/5", children: [_jsx("span", { className: "text-amber-400 text-sm font-bold uppercase tracking-tight", children: "\u26A0\uFE0F Network Mismatch: Switch to Polkadot Hub" }), _jsx("button", { onClick: () => switchChain({ chainId: pasTestnet.id }), className: "bg-amber-500 hover:bg-amber-400 text-black font-black px-4 py-2 rounded-xl text-[10px] uppercase transition-all", children: "Switch Now" })] })), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-12 gap-8", children: [_jsxs("div", { className: "lg:col-span-8 bg-polkadot-card border border-polkadot-border rounded-3xl overflow-hidden shadow-2xl", children: [_jsx("div", { className: "flex border-b border-polkadot-border bg-black/20 p-2 gap-2", children: ['USDT', 'USDC'].map(t => (_jsxs("button", { onClick: () => handleTokenSwitch(t), className: `flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${token === t ? `${TOKEN_CONFIG[t].bg} ${TOKEN_CONFIG[t].color} border border-white/5` : 'text-gray-600 hover:text-gray-400'}`, children: [_jsx("div", { className: `w-1.5 h-1.5 rounded-full ${TOKEN_CONFIG[t].dot}` }), t] }, t))) }), _jsxs("div", { className: "p-8 space-y-8", children: [_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-[10px] text-gray-600 font-black uppercase tracking-widest ml-1", children: "Recipient Address" }), _jsx("input", { type: "text", value: to, onChange: e => setTo(e.target.value), placeholder: "0x...", className: "w-full bg-polkadot-dark border border-polkadot-border rounded-2xl px-5 py-4 text-sm font-mono text-white placeholder-gray-800 outline-none focus:border-polkadot-pink/40 transition-all shadow-inner" })] }), _jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex justify-between items-end ml-1", children: [_jsx("label", { className: "text-[10px] text-gray-600 font-black uppercase tracking-widest", children: "Amount to Send" }), balance !== null && balance > 0 && (_jsxs("button", { onClick: () => setAmount(balance.toFixed(6)), className: `${cfg.color} text-[10px] font-black uppercase hover:opacity-70 transition-opacity`, children: ["Max: ", balance.toFixed(2)] }))] }), _jsxs("div", { className: "relative", children: [_jsx("input", { type: "number", value: amount, onChange: e => setAmount(e.target.value), placeholder: "0.00", className: "w-full bg-polkadot-dark border border-polkadot-border rounded-2xl px-5 py-4 text-xl font-mono text-white placeholder-gray-800 outline-none focus:border-polkadot-pink/40 transition-all shadow-inner" }), _jsx("div", { className: `absolute right-5 top-1/2 -translate-y-1/2 font-black text-sm uppercase ${cfg.color}`, children: token })] })] }), status === 'success' ? (_jsxs("div", { className: "bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 text-center space-y-4", children: [_jsx("div", { className: "text-emerald-400 font-black uppercase tracking-widest text-sm", children: "\u2726 Transfer Successful" }), _jsx("button", { onClick: () => setStatus('idle'), className: "text-gray-500 text-[10px] font-bold uppercase underline hover:text-white transition-colors", children: "Send Another" })] })) : (_jsx("button", { onClick: handleSend, disabled: !canSend, className: `w-full py-5 rounded-2xl font-black uppercase tracking-widest text-sm transition-all shadow-lg ${canSend ? 'bg-polkadot-pink text-white shadow-polkadot-pink/20 hover:scale-[1.02] active:scale-[0.98]' : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`, children: status === 'signing' ? 'Check MetaMask...' : status === 'mining' ? 'Confirming on Hub...' : `Transfer ${token}` })), errMsg && _jsx("div", { className: "text-red-400 text-[10px] font-black uppercase text-center", children: errMsg })] })] }), _jsxs("div", { className: "lg:col-span-4 space-y-6", children: [_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-3xl p-6 space-y-4 shadow-xl", children: [_jsx("h3", { className: "text-[10px] text-gray-500 font-black uppercase tracking-widest", children: "Network Logic" }), _jsxs("div", { className: "space-y-4 text-[11px] leading-relaxed text-gray-400 font-medium", children: [_jsxs("p", { children: ["Transfers are executed via ", _jsx("span", { className: "text-white", children: "ERC-20 Precompiles" }), " which map directly to the Substrate Assets Pallet."] }), _jsxs("p", { children: ["Gas is settled in ", _jsx("span", { className: "text-emerald-400", children: "PAS" }), " tokens. No ETH or bridge fees required."] })] })] }), isConnected && (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-3xl p-6 space-y-4 shadow-xl", children: [_jsx("h3", { className: "text-[10px] text-gray-500 font-black uppercase tracking-widest", children: "Your Balances" }), _jsx("div", { className: "space-y-3", children: ['USDT', 'USDC'].map(t => (_jsxs("div", { className: "flex justify-between items-center bg-black/20 p-3 rounded-xl border border-white/5", children: [_jsx("span", { className: "text-[10px] font-black text-gray-500", children: t }), _jsx("span", { className: "text-xs font-mono text-white", children: balLoading ? '...' : (t === 'USDT' ? balances?.usdt : balances?.usdc)?.toFixed(2) ?? '0.00' })] }, t))) })] }))] })] })] }));
}
