import { useState, useCallback, useRef, useEffect } from 'react';
import { useWriteContract, useAccount, useSwitchChain, useChainId } from 'wagmi';
import { createPublicClient, http }                 from 'viem';
import type { ScoreBreakdown, RawChainData }        from '../types/index.js';

const RPC_URL = 'https://services.polkadothub-rpc.com/testnet';

const PAS_TESTNET = {
  id:             420420417,
  name:           'Polkadot Hub TestNet',
  nativeCurrency: { name: 'PAS', symbol: 'PAS', decimals: 18 },
  rpcUrls:        { default: { http: [RPC_URL] } },
} as const;

const MINT_SCORE_ABI = [
  {
    name:            'mintScore',
    type:            'function',
    inputs: [
      { name: 'wallet',    type: 'address' },
      { name: 'score',     type: 'uint16'  },
      { name: 'dataHash',  type: 'bytes32' },
      { name: 'deadline',  type: 'uint256' },
      { name: 'signature', type: 'bytes'   },
    ],
    outputs:         [],
    stateMutability: 'nonpayable',
  },
  { type: 'error', name: 'InvalidSignature', inputs: [] },
  { type: 'error', name: 'DeadlineExpired',  inputs: [] },
  { type: 'error', name: 'InvalidScore',     inputs: [] },
  { type: 'error', name: 'SoulboundToken',   inputs: [] },
  { type: 'error', name: 'ZeroAddress',      inputs: [] },
  {
    type:   'error',
    name:   'CooldownActive',
    inputs: [{ name: 'refreshAvailableAt', type: 'uint64' }],
  },
] as const;

export type ScoreStatus =
  | 'idle'
  | 'reading'
  | 'scoring'
  | 'signing'
  | 'waiting'
  | 'confirming'
  | 'done'
  | 'cooldown'
  | 'relay_auth'
  | 'relay_submitting'
  | 'error';

export interface ScorePayload {
  wallet:          string;
  score:           number;
  dataHash:        string;
  signature:       string;
  deadline:        number;
  nonce:           number;
  reasoning:       string;
  breakdown:       ScoreBreakdown;
  rawChainData:    RawChainData;
  alreadyHadScore: boolean;
  expiresAt?:      number;  // unix seconds from contract
  txHash?:         string;
  relayed?:        boolean;
}

function parseCooldownTs(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  if (!msg.includes('CooldownActive')) return null;
  const match = msg.match(/\((\d{9,11})\)/);
  return match ? Number(match[1]) : null;
}

function parseRevertMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('InvalidSignature')) return 'Signature verification failed. Please generate a new score.';
  if (msg.includes('DeadlineExpired'))  return 'Signature expired. Please generate a new score.';
  if (msg.includes('User rejected') || msg.includes('user rejected') || msg.includes('4001') || msg.includes('denied'))
    return 'Transaction cancelled. Click Generate Score to try again.';
  if (err instanceof Error && err.name === 'TimeoutError') return 'Request timed out. Please try again.';
  return msg;
}

async function checkSufficientPAS(walletAddress: string): Promise<boolean> {
  try {
    const res  = await fetch(`/fee-info/${walletAddress}`);
    const json = await res.json() as { hasSufficientPas?: boolean };
    return json.hasSufficientPas ?? true;
  } catch {
    return true;
  }
}

async function signRelayAuth(walletAddress: string, deadline: number): Promise<string> {
  if (typeof window === 'undefined' || !window.ethereum) throw new Error('MetaMask not available');
  const message = `VeraScore relay mint authorized\nWallet: ${walletAddress.toLowerCase()}\nDeadline: ${deadline}`;
  return await window.ethereum.request({
    method: 'personal_sign',
    params: [message, walletAddress],
  }) as string;
}

async function rawGetReceipt(txHash: string): Promise<'confirmed' | 'reverted' | 'pending'> {
  const res = await fetch(RPC_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }),
    signal:  AbortSignal.timeout(8_000),
  });
  const json = await res.json() as { result?: { blockNumber?: string; status?: string } | null };
  if (!json.result || !json.result.blockNumber) return 'pending';
  return json.result.status === '0x1' ? 'confirmed' : 'reverted';
}

function startReceiptPoll(
  txHash:    `0x${string}`,
  onSuccess: (hash: `0x${string}`) => void,
  onTimeout: (msg: string)          => void,
): () => void {
  let cancelled = false;
  let attempts  = 0;
  const MAX     = 80;

  const tick = async () => {
    if (cancelled) return;
    if (attempts >= MAX) { onTimeout('Transaction confirmation timeout. Check Routescan for your tx status.'); return; }
    attempts++;
    try {
      const result = await rawGetReceipt(txHash);
      if (cancelled) return;
      if (result === 'confirmed') {
        onSuccess(txHash);
      } else if (result === 'reverted') {
        onTimeout('Transaction reverted. Your NFT may already exist — check the Lookup page.');
      } else {
        setTimeout(tick, 3_000);
      }
    } catch {
      if (!cancelled) setTimeout(tick, 3_000);
    }
  };

  const t = setTimeout(tick, 2_000);
  return () => { cancelled = true; clearTimeout(t); };
}


export function useScore(): {
  status:           ScoreStatus;
  payload:          ScorePayload | null;
  error:            string | null;
  cooldownTs:       number | null;
  gasEstimate:      { pas: string; usd: string } | null;
  rateLimitSec:     number | null;
  hasCachedPayload: boolean;
  requestScore:     (walletAddress: string) => Promise<void>;
  retryMint:        () => Promise<void>;
  reset:            () => void;
} {
  const [status,       setStatus]       = useState<ScoreStatus>('idle');
  const [payload,      setPayload]      = useState<ScorePayload | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [cooldownTs,   setCooldownTs]   = useState<number | null>(null);
  const [gasEstimate,  setGasEstimate]  = useState<{ pas: string; usd: string } | null>(null);
  const [rateLimitSec, setRateLimitSec] = useState<number | null>(null);
  // Keep ref in sync so requestScore can read current value without stale closure
  useEffect(() => { rateLimitSecRef.current = rateLimitSec; }, [rateLimitSec]);

  const { address }            = useAccount();
  const chainId                = useChainId();
  const { switchChainAsync }   = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const pendingData            = useRef<ScorePayload | null>(null);
  const cancelPoll             = useRef<(() => void) | null>(null);
  const rateLimitSecRef        = useRef<number | null>(null);  // mirror for closure access

  const onConfirmed = useCallback((txHash: `0x${string}`) => {
    const data = pendingData.current;
    if (data) {
      fetch(`/score/${data.wallet}/confirm`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ txHash, score: data.score, breakdown: data.breakdown }),
      }).catch(() => {});
      try { sessionStorage.removeItem(`vs_payload_${data.wallet.toLowerCase()}`); } catch { /**/ }
      setPayload({ ...data, txHash });
    }
    cancelPoll.current = null;
    setStatus('done');
  }, []);

  const onPollTimeout = useCallback((msg: string) => {
    cancelPoll.current = null;
    setError(msg);
    setStatus('error');
  }, []);

  const beginConfirming = useCallback((txHash: `0x${string}`) => {
    if (cancelPoll.current) cancelPoll.current();
    setStatus('confirming');
    cancelPoll.current = startReceiptPoll(txHash, onConfirmed, onPollTimeout);
  }, [onConfirmed, onPollTimeout]);

  useEffect(() => () => { if (cancelPoll.current) cancelPoll.current(); }, []);

  const reset = useCallback(() => {
    if (cancelPoll.current) { cancelPoll.current(); cancelPoll.current = null; }
    pendingData.current = null;
    setStatus('idle');
    setPayload(null);
    setError(null);
    setCooldownTs(null);
    setGasEstimate(null);
    // NOTE: do NOT clear rateLimitSec here — the countdown must keep ticking
    // even after the user dismisses. It is cleared automatically when it hits 0.
  }, []);

  const prevAddress = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prev = prevAddress.current;
    prevAddress.current = address;
    if (prev !== undefined && prev !== address) reset();
  }, [address, reset]);

  useEffect(() => {
    if (rateLimitSec === null || rateLimitSec <= 0) return;
    const id = setInterval(() => {
      setRateLimitSec(prev => {
        if (prev === null || prev <= 1) { clearInterval(id); return 0; }
        return prev - 1;
      });
    }, 1_000);
    return () => clearInterval(id);
  }, [rateLimitSec]);

  const doMint = useCallback(async (
    data:          ScorePayload,
    walletAddr:    string,
    proxyAddress:  `0x${string}`,
  ) => {
    if (chainId !== PAS_TESTNET.id) {
      try { await switchChainAsync({ chainId: PAS_TESTNET.id }); } catch { throw new Error('Please switch MetaMask to Polkadot Hub TestNet before minting.'); }
    }
    setGasEstimate(null);
    try {
      const c            = createPublicClient({ chain: PAS_TESTNET, transport: http(RPC_URL) });
      const estimatedGas = await c.estimateContractGas({
        address:      proxyAddress,
        abi:          MINT_SCORE_ABI,
        functionName: 'mintScore',
        args:         [data.wallet as `0x${string}`, data.score, data.dataHash as `0x${string}`, BigInt(data.deadline), data.signature as `0x${string}`],
        account:      walletAddr as `0x${string}`,
      });
      const gasPrice = await c.getGasPrice();
      const costPas  = Number(estimatedGas * gasPrice) / 1e18;
      setGasEstimate({ pas: costPas.toFixed(6), usd: (costPas * 0.05).toFixed(4) });
    } catch { /**/ }

    setStatus('waiting');

    const sim = createPublicClient({ chain: PAS_TESTNET, transport: http(RPC_URL) });
    try {
      await sim.simulateContract({
        address:      proxyAddress,
        abi:          MINT_SCORE_ABI,
        functionName: 'mintScore',
        args:         [data.wallet as `0x${string}`, data.score, data.dataHash as `0x${string}`, BigInt(data.deadline), data.signature as `0x${string}`],
        account:      walletAddr as `0x${string}`,
      });
    } catch (simErr: unknown) {
      const ts = parseCooldownTs(simErr);
      if (ts !== null) { setCooldownTs(ts); setStatus('cooldown'); return; }
      throw simErr;
    }

    const txHash = await writeContractAsync({
      address:      proxyAddress,
      abi:          MINT_SCORE_ABI,
      functionName: 'mintScore',
      args:         [data.wallet as `0x${string}`, data.score, data.dataHash as `0x${string}`, BigInt(data.deadline), data.signature as `0x${string}`],
      gas:          300_000n,
    });

    pendingData.current = data;
    beginConfirming(txHash);
  }, [writeContractAsync, beginConfirming, chainId, switchChainAsync]);

  const retryMint = useCallback(async () => {
    const data = pendingData.current;
    if (!data) return;
    if (data.deadline <= Math.floor(Date.now() / 1_000)) {
      pendingData.current = null;
      setStatus('idle');
      setError(null);
      return;
    }
    const proxyAddress = import.meta.env.VITE_SCORE_NFT_PROXY as `0x${string}`;
    setError(null);
    try {
      await doMint(data, address ?? data.wallet, proxyAddress);
    } catch (err: unknown) {
      setError(parseRevertMessage(err));
      setStatus('error');
    }
  }, [address, doMint]);

  const requestScore = useCallback(async (walletAddress: string) => {
    // Guard: don't restart if still in rate-limit cooldown
    // Use ref (not state) to avoid stale closure reads
    if (rateLimitSecRef.current !== null && rateLimitSecRef.current > 0) return;

    setStatus('reading');
    setError(null);
    setPayload(null);
    setCooldownTs(null);
    pendingData.current = null;

    const proxyAddress = import.meta.env.VITE_SCORE_NFT_PROXY as `0x${string}`;
    if (!proxyAddress) { setError('VITE_SCORE_NFT_PROXY not set'); setStatus('error'); return; }

    try {
      setStatus('scoring');
      const res  = await fetch(`/score/${walletAddress}`, {
        method: 'POST',
        signal: AbortSignal.timeout(90_000),
      });
      const json = await res.json();

      if (res.status === 429) {
        const secs = json.waitSec ?? 60;
        try {
          const raw = sessionStorage.getItem(`vs_payload_${walletAddress.toLowerCase()}`);
          if (raw) {
            const cached = JSON.parse(raw) as ScorePayload;
            if (cached.deadline > Math.floor(Date.now() / 1_000) + 30) {
              pendingData.current = cached;
              setPayload(cached);
              setError('retry_available');
              setStatus('error');
              return;
            }
          }
        } catch { /**/ }
        setRateLimitSec(secs);
        setError(`rate_limited:${secs}`);
        setStatus('error');
        return;
      }

      if (res.status === 400 && json.code === 'SCORE_STILL_VALID') {
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
          const minM  = msg.match(/(\d+)\s*min/i);
          if (hourM) secs = parseInt(hourM[1]) * 3600;
          else if (minM) secs = parseInt(minM[1]) * 60;
          setRateLimitSec(secs);
          setError(`rate_limited:${secs}`);
          setStatus('error');
          return;
        }
        throw new Error(msg);
      }

      const data = json.data as ScorePayload;
      pendingData.current = data;
      setPayload(data);
      try { sessionStorage.setItem(`vs_payload_${walletAddress.toLowerCase()}`, JSON.stringify(data)); } catch { /**/ }

      const canPayGas = await checkSufficientPAS(walletAddress);

      if (!canPayGas) {
        setStatus('relay_auth');
        let userAuthSig: string;
        try {
          userAuthSig = await signRelayAuth(walletAddress, data.deadline);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('rejected') || msg.includes('denied') || msg.includes('4001'))
            throw new Error('Relay authorization cancelled. Click Generate Score to try again.');
          throw err;
        }
        setStatus('relay_submitting');
        const relayRes = await fetch(`/score/${walletAddress}/relay-mint`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ score: data.score, dataHash: data.dataHash, deadline: data.deadline, signature: data.signature, userAuthSig }),
          signal:  AbortSignal.timeout(60_000),
        });
        const relayJson = await relayRes.json() as { success: boolean; txHash?: string; error?: string };
        if (!relayRes.ok || !relayJson.success) throw new Error(relayJson.error ?? 'Relay mint failed. Please try again.');
        const txHash = relayJson.txHash!;
        pendingData.current = { ...data, relayed: true };
        beginConfirming(txHash as `0x${string}`);
        return;
      }

      await doMint(data, walletAddress, proxyAddress);

    } catch (err: unknown) {
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