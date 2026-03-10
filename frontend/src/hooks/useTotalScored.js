import { useReadContract } from 'wagmi';
import { SCORE_NFT_PROXY } from '../utils/wagmi'; // Removed .js pa!
const ABI = [
    {
        name: 'totalScored',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint256' }],
    },
];
// 12s is exactly two block times on Paseo pa!
const REFETCH_INTERVAL = 12_000;
export function useTotalScored() {
    const { data } = useReadContract({
        address: SCORE_NFT_PROXY,
        abi: ABI,
        functionName: 'totalScored',
        query: {
            refetchInterval: REFETCH_INTERVAL,
            staleTime: REFETCH_INTERVAL,
        },
    });
    // Simple check to handle the loading state
    if (data === undefined || data === null)
        return null;
    return Number(data);
}
