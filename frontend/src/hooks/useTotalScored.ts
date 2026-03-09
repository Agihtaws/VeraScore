import { useReadContract } from 'wagmi';
import { SCORE_NFT_PROXY } from '../utils/wagmi.js';

const ABI = [
  {
    name:            'totalScored',
    type:            'function',
    stateMutability: 'view',
    inputs:          [],
    outputs:         [{ name: '', type: 'uint256' }],
  },
] as const;

// How often to re-read from chain (ms)
// 12s ≈ two block times on PAS TestNet — keeps the number fresh
// without hammering the RPC
const REFETCH_INTERVAL = 12_000;

export function useTotalScored(): number | null {
  const { data } = useReadContract({
    address:         SCORE_NFT_PROXY,
    abi:             ABI,
    functionName:    'totalScored',
    query: {
      refetchInterval: REFETCH_INTERVAL,
      staleTime:       REFETCH_INTERVAL,
    },
  });

  if (data === undefined || data === null) return null;
  return Number(data);
}