import { useState, useCallback, useRef, useEffect } from 'react';
import { useWriteContract, useAccount, useSwitchChain, useChainId } from 'wagmi';
import { createPublicClient, http } from 'viem';
const RPC_URL = 'https://services.polkadothub-rpc.com/testnet';
const PAS_TESTNET = {
    id: 420420417,
    name: 'Polkadot Hub TestNet',
    nativeCurrency: { name: 'PAS', symbol: 'PAS', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
};
const MINT_SCORE_ABI = [
    {
        name: 'mintScore',
        type: 'function',
        inputs: [
            { name: 'wallet', type: 'address' },
            { name: 'score', type: 'uint16' },
            { name: 'dataHash', type: 'bytes32' },
            { name: 'deadline', type: 'uint256' },
            { name: 'signature', type: 'bytes' },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    { type: 'error', name: 'InvalidSignature', inputs: [] },
    { type: 'error', name: 'DeadlineExpired', inputs: [] },
    { type: 'error', name: 'InvalidScore', inputs: [] },
    { type: 'error', name: 'SoulboundToken', inputs: [] },
    { type: 'error', name: 'ZeroAddress', inputs: [] },
    {
        type: 'error',
        name: 'CooldownActive',
        inputs: [{ name: 'refreshAvailableAt', type: 'uint64' }],
    },
];
function parseCooldownTs(err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('CooldownActive'))
        return null;
    const match = msg.match(/\((\d{9,11})\)/);
    return match ? Number(match[1]) : null;
}
function parseRevertMessage(err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('InvalidSignature'))
        return 'Signature verification failed. Please generate a new score.';
    if (msg.includes('DeadlineExpired'))
        return 'Signature expired. Please generate a new score.';
    if (msg.includes('User rejected') || msg.includes('user rejected') || msg.includes('4001') || msg.includes('denied'))
        return 'Transaction cancelled. Click Generate Score to try again.';
    if (err instanceof Error && err.name === 'TimeoutError')
        return 'Request timed out. Please try again.';
    return msg;
}
async function checkSufficientPAS(walletAddress) {
    try {
        const res = await fetch(`/fee-info/${walletAddress}`);
        const json = await res.json();
        return json.hasSufficientPas ?? true;
    }
    catch {
        return true;
    }
}
async function signRelayAuth(walletAddress, deadline) {
    if (typeof window === 'undefined' || !window.ethereum)
        throw new Error('MetaMask not available');
    const message = `VeraScore relay mint authorized\nWallet: ${walletAddress.toLowerCase()}\nDeadline: ${deadline}`;
    return await window.ethereum.request({
        method: 'personal_sign',
        params: [message, walletAddress],
    });
}
async function rawGetReceipt(txHash) {
    const res = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }),
        signal: AbortSignal.timeout(8_000),
    });
    const json = await res.json();
    if (!json.result || !json.result.blockNumber)
        return 'pending';
    return json.result.status === '0x1' ? 'confirmed' : 'reverted';
}
function startReceiptPoll(txHash, onSuccess, onTimeout) {
    let cancelled = false;
    let attempts = 0;
    const MAX = 80;
    const tick = async () => {
        if (cancelled)
            return;
        if (attempts >= MAX) {
            onTimeout('Transaction confirmation timeout. Check Routescan for your tx status.');
            return;
        }
        attempts++;
        try {
            const result = await rawGetReceipt(txHash);
            if (cancelled)
                return;
            if (result === 'confirmed') {
                onSuccess(txHash);
            }
            else if (result === 'reverted') {
                onTimeout('Transaction reverted. Your NFT may already exist — check the Lookup page.');
            }
            else {
                setTimeout(tick, 3_000);
            }
        }
        catch {
            if (!cancelled)
                setTimeout(tick, 3_000);
        }
    };
    const t = setTimeout(tick, 2_000);
    return () => { cancelled = true; clearTimeout(t); };
}
export function useScore() {
    const [status, setStatus] = useState('idle');
    const [payload, setPayload] = useState(null);
    const [error, setError] = useState(null);
    const [cooldownTs, setCooldownTs] = useState(null);
    const [gasEstimate, setGasEstimate] = useState(null);
    const [rateLimitSec, setRateLimitSec] = useState(null);
    // Keep ref in sync so requestScore can read current value without stale closure
    useEffect(() => { rateLimitSecRef.current = rateLimitSec; }, [rateLimitSec]);
    const { address } = useAccount();
    const chainId = useChainId();
    const { switchChainAsync } = useSwitchChain();
    const { writeContractAsync } = useWriteContract();
    const pendingData = useRef(null);
    const cancelPoll = useRef(null);
    const rateLimitSecRef = useRef(null); // mirror for closure access
    const onConfirmed = useCallback((txHash) => {
        console.log('✅ [useScore] onConfirmed called with txHash:', txHash);
        const data = pendingData.current;
        if (data) {
            fetch(`/score/${data.wallet}/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ txHash, score: data.score, breakdown: data.breakdown }),
            }).catch(() => { });
            try {
                sessionStorage.removeItem(`vs_payload_${data.wallet.toLowerCase()}`);
            }
            catch { /**/ }
            setPayload({ ...data, txHash });
        }
        cancelPoll.current = null;
        setStatus('done');
    }, []);
    const onPollTimeout = useCallback((msg) => {
        console.warn('⚠️ [useScore] poll timeout:', msg);
        cancelPoll.current = null;
        setError(msg);
        setStatus('error');
    }, []);
    const beginConfirming = useCallback((txHash) => {
        console.log('⏳ [useScore] beginConfirming for txHash:', txHash);
        if (cancelPoll.current)
            cancelPoll.current();
        setStatus('confirming');
        cancelPoll.current = startReceiptPoll(txHash, onConfirmed, onPollTimeout);
    }, [onConfirmed, onPollTimeout]);
    useEffect(() => () => { if (cancelPoll.current)
        cancelPoll.current(); }, []);
    const reset = useCallback(() => {
        console.log('🔄 [useScore] reset called');
        if (cancelPoll.current) {
            cancelPoll.current();
            cancelPoll.current = null;
        }
        pendingData.current = null;
        setStatus('idle');
        setPayload(null);
        setError(null);
        setCooldownTs(null);
        setGasEstimate(null);
        // NOTE: do NOT clear rateLimitSec here — the countdown must keep ticking
        // even after the user dismisses. It is cleared automatically when it hits 0.
    }, []);
    const prevAddress = useRef(undefined);
    useEffect(() => {
        const prev = prevAddress.current;
        prevAddress.current = address;
        if (prev !== undefined && prev !== address)
            reset();
    }, [address, reset]);
    useEffect(() => {
        if (rateLimitSec === null || rateLimitSec <= 0)
            return;
        const id = setInterval(() => {
            setRateLimitSec(prev => {
                if (prev === null || prev <= 1) {
                    clearInterval(id);
                    return 0;
                }
                return prev - 1;
            });
        }, 1_000);
        return () => clearInterval(id);
    }, [rateLimitSec]);
    const doMint = useCallback(async (data, walletAddr, proxyAddress) => {
        console.log('🚀 [useScore] doMint starting', { walletAddr, proxyAddress });
        if (chainId !== PAS_TESTNET.id) {
            try {
                await switchChainAsync({ chainId: PAS_TESTNET.id });
            }
            catch {
                throw new Error('Please switch MetaMask to Polkadot Hub TestNet before minting.');
            }
        }
        setGasEstimate(null);
        try {
            const c = createPublicClient({ chain: PAS_TESTNET, transport: http(RPC_URL) });
            const estimatedGas = await c.estimateContractGas({
                address: proxyAddress,
                abi: MINT_SCORE_ABI,
                functionName: 'mintScore',
                args: [data.wallet, data.score, data.dataHash, BigInt(data.deadline), data.signature],
                account: walletAddr,
            });
            const gasPrice = await c.getGasPrice();
            const costPas = Number(estimatedGas * gasPrice) / 1e18;
            setGasEstimate({ pas: costPas.toFixed(6), usd: (costPas * 0.05).toFixed(4) });
        }
        catch { /**/ }
        setStatus('waiting');
        const sim = createPublicClient({ chain: PAS_TESTNET, transport: http(RPC_URL) });
        try {
            await sim.simulateContract({
                address: proxyAddress,
                abi: MINT_SCORE_ABI,
                functionName: 'mintScore',
                args: [data.wallet, data.score, data.dataHash, BigInt(data.deadline), data.signature],
                account: walletAddr,
            });
        }
        catch (simErr) {
            const ts = parseCooldownTs(simErr);
            if (ts !== null) {
                setCooldownTs(ts);
                setStatus('cooldown');
                return;
            }
            throw simErr;
        }
        console.log('📤 [useScore] calling writeContractAsync');
        const txHash = await writeContractAsync({
            address: proxyAddress,
            abi: MINT_SCORE_ABI,
            functionName: 'mintScore',
            args: [data.wallet, data.score, data.dataHash, BigInt(data.deadline), data.signature],
            gas: 300000n,
        });
        console.log('✅ [useScore] writeContractAsync returned txHash:', txHash);
        pendingData.current = data;
        beginConfirming(txHash);
    }, [writeContractAsync, beginConfirming, chainId, switchChainAsync]);
    const retryMint = useCallback(async () => {
        console.log('🔁 [useScore] retryMint called');
        const data = pendingData.current;
        if (!data) {
            console.warn('⚠️ [useScore] retryMint called but no pending data');
            return;
        }
        if (data.deadline <= Math.floor(Date.now() / 1_000)) {
            console.warn('⚠️ [useScore] retryMint: payload expired');
            pendingData.current = null;
            setStatus('idle');
            setError(null);
            return;
        }
        const proxyAddress = import.meta.env.VITE_SCORE_NFT_PROXY;
        setError(null);
        try {
            await doMint(data, address ?? data.wallet, proxyAddress);
        }
        catch (err) {
            console.error('❌ [useScore] retryMint error:', err);
            const errorMsg = parseRevertMessage(err);
            // If the signature is permanently invalid (nonce used), clear the cached payload
            if (errorMsg.includes('Signature verification failed') ||
                (err instanceof Error && err.message.includes('InvalidSignature'))) {
                console.log('🧹 [useScore] clearing invalid cached payload');
                pendingData.current = null;
                try {
                    sessionStorage.removeItem(`vs_payload_${data.wallet.toLowerCase()}`);
                }
                catch { }
            }
            setError(errorMsg);
            setStatus('error');
        }
    }, [address, doMint]);
    const requestScore = useCallback(async (walletAddress) => {
        console.log('📝 [useScore] requestScore called for', walletAddress);
        // Guard: don't restart if still in rate-limit cooldown
        // Use ref (not state) to avoid stale closure reads
        if (rateLimitSecRef.current !== null && rateLimitSecRef.current > 0) {
            console.log('⏳ [useScore] rate limit active, ignoring request');
            return;
        }
        setStatus('reading');
        setError(null);
        setPayload(null);
        setCooldownTs(null);
        pendingData.current = null;
        const proxyAddress = import.meta.env.VITE_SCORE_NFT_PROXY;
        if (!proxyAddress) {
            setError('VITE_SCORE_NFT_PROXY not set');
            setStatus('error');
            return;
        }
        try {
            setStatus('scoring');
            console.log('🌐 [useScore] POST to /score');
            const res = await fetch(`/score/${walletAddress}`, {
                method: 'POST',
                signal: AbortSignal.timeout(90_000),
            });
            const json = await res.json();
            if (res.status === 429) {
                const secs = json.waitSec ?? 60;
                console.log('⏳ [useScore] rate limited, waitSec:', secs);
                // ALWAYS set the rate limit timer, even if we have a cached payload
                setRateLimitSec(secs);
                try {
                    const raw = sessionStorage.getItem(`vs_payload_${walletAddress.toLowerCase()}`);
                    if (raw) {
                        const cached = JSON.parse(raw);
                        if (cached.deadline > Math.floor(Date.now() / 1_000) + 30) {
                            console.log('💾 [useScore] found valid cached payload, setting retry_available');
                            pendingData.current = cached;
                            setPayload(cached);
                            setError('retry_available');
                            setStatus('error');
                            return;
                        }
                    }
                }
                catch { /**/ }
                setError(`rate_limited:${secs}`);
                setStatus('error');
                return;
            }
            if (res.status === 400 && json.code === 'SCORE_STILL_VALID') {
                console.log('⏳ [useScore] cooldown active from contract');
                setCooldownTs(json.refreshAvailableAt ?? null);
                setStatus('cooldown');
                return;
            }
            // Also detect rate limit from non-429 responses (backend quirks)
            if (!res.ok || !json.success) {
                const msg = json.error ?? 'Scoring failed. Please try again.';
                const isRateMsg = msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('try again in');
                if (isRateMsg) {
                    // Parse seconds: "Try again in 1 hour" → 3600
                    let secs = json.waitSec ?? 3600;
                    const hourM = msg.match(/(\d+)\s*hour/i);
                    const minM = msg.match(/(\d+)\s*min/i);
                    if (hourM)
                        secs = parseInt(hourM[1]) * 3600;
                    else if (minM)
                        secs = parseInt(minM[1]) * 60;
                    setRateLimitSec(secs);
                    setError(`rate_limited:${secs}`);
                    setStatus('error');
                    return;
                }
                throw new Error(msg);
            }
            const data = json.data;
            console.log('✅ [useScore] score generated, payload:', data);
            pendingData.current = data;
            setPayload(data);
            try {
                sessionStorage.setItem(`vs_payload_${walletAddress.toLowerCase()}`, JSON.stringify(data));
            }
            catch { /**/ }
            const canPayGas = await checkSufficientPAS(walletAddress);
            console.log('💰 [useScore] canPayGas:', canPayGas);
            if (!canPayGas) {
                setStatus('relay_auth');
                let userAuthSig;
                try {
                    userAuthSig = await signRelayAuth(walletAddress, data.deadline);
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    if (msg.includes('rejected') || msg.includes('denied') || msg.includes('4001'))
                        throw new Error('Relay authorization cancelled. Click Generate Score to try again.');
                    throw err;
                }
                setStatus('relay_submitting');
                console.log('🌐 [useScore] POST to /relay-mint');
                const relayRes = await fetch(`/score/${walletAddress}/relay-mint`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ score: data.score, dataHash: data.dataHash, deadline: data.deadline, signature: data.signature, userAuthSig }),
                    signal: AbortSignal.timeout(60_000),
                });
                const relayJson = await relayRes.json();
                if (!relayRes.ok || !relayJson.success)
                    throw new Error(relayJson.error ?? 'Relay mint failed. Please try again.');
                const txHash = relayJson.txHash;
                console.log('✅ [useScore] relay txHash:', txHash);
                pendingData.current = { ...data, relayed: true };
                beginConfirming(txHash);
                return;
            }
            await doMint(data, walletAddress, proxyAddress);
        }
        catch (err) {
            console.error('❌ [useScore] requestScore error:', err);
            setError(parseRevertMessage(err));
            setStatus('error');
        }
    }, [doMint, beginConfirming]);
    return {
        status,
        payload,
        error,
        cooldownTs,
        gasEstimate,
        rateLimitSec,
        hasCachedPayload: !!pendingData.current,
        requestScore,
        retryMint,
        reset,
    };
}
