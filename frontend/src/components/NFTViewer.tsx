import { useState, useEffect } from 'react';
import { createPublicClient, http } from 'viem';

// Using the faster RPC we found to make the NFT load instantly pa!
const RPC = 'https://pas-rpc.stakeworld.io/assethub';

const ABI = [
  {
    name:            'tokenIdOf',
    type:            'function',
    stateMutability: 'view',
    inputs:          [{ name: 'wallet', type: 'address' }],
    outputs:         [{ name: '',       type: 'uint256' }],
  },
  {
    name:            'tokenURI',
    type:            'function',
    stateMutability: 'view',
    inputs:          [{ name: 'tokenId', type: 'uint256' }],
    outputs:         [{ name: '',        type: 'string'  }],
  },
] as const;

interface Props {
  wallet:       string;
  proxyAddress: `0x${string}`;
}

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'done'; tokenId: string; svgDataUrl: string; name: string };

function decodeTokenURI(tokenUri: string): { svgDataUrl: string; name: string } {
  const base64Json = tokenUri.replace('data:application/json;base64,', '');
  const jsonStr    = atob(base64Json);
  const metadata   = JSON.parse(jsonStr) as { name?: string; image?: string };

  const name       = metadata.name ?? 'VeraScore NFT';
  const svgDataUrl = metadata.image ?? '';

  if (!svgDataUrl) throw new Error('No image in tokenURI metadata');
  return { svgDataUrl, name };
}

export function NFTViewer({ wallet, proxyAddress }: Props) {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function fetchNFT() {
      if (!wallet) return;
      setState({ phase: 'loading' });
      
      try {
        const client = createPublicClient({
          transport: http(RPC),
        });

        // Step 1 — get tokenId for this wallet
        const tokenId = await client.readContract({
          address:      proxyAddress,
          abi:          ABI,
          functionName: 'tokenIdOf',
          args:         [wallet as `0x${string}`],
        });

        // 0n means the user hasn't minted their score NFT yet pa!
        if (tokenId === 0n) {
          setState({ phase: 'error', message: 'No NFT found' });
          return;
        }

        // Step 2 — get tokenURI
        const uri = await client.readContract({
          address:      proxyAddress,
          abi:          ABI,
          functionName: 'tokenURI',
          args:         [tokenId],
        });

        // Step 3 — decode
        const { svgDataUrl, name } = decodeTokenURI(uri as string);

        if (!cancelled) {
          setState({
            phase:      'done',
            tokenId:    tokenId.toString(),
            svgDataUrl,
            name,
          });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load NFT';
          console.warn('[NFTViewer]', msg);
          setState({ phase: 'error', message: msg });
        }
      }
    }

    // 2s delay is perfect to let the Substrate indexer catch up after a mint pa!
    const t = setTimeout(fetchNFT, 2000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [wallet, proxyAddress]);

  if (state.phase === 'loading') {
    return (
      <div className="bg-polkadot-card border border-polkadot-border rounded-2xl p-6 flex flex-col items-center gap-3 shadow-lg">
        <div className="text-xs text-gray-500 uppercase tracking-widest w-full font-bold">Your Score NFT</div>
        <div className="flex items-center gap-3 text-sm text-gray-400 py-8">
          <div className="w-5 h-5 border-2 border-polkadot-pink border-t-transparent rounded-full animate-spin" />
          Fetching on-chain metadata...
        </div>
      </div>
    );
  }

  // If there's an error (like no NFT), we just hide it to keep the UI clean pa!
  if (state.phase === 'error') {
    return null;
  }

  const { tokenId, svgDataUrl, name } = state;

  return (
    <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden w-full shadow-2xl transition-all hover:border-polkadot-pink/30">
      
      {/* Header */}
      <div className="px-5 py-4 border-b border-polkadot-border flex items-center justify-between bg-white/5">
        <div className="text-xs text-gray-400 uppercase tracking-widest font-bold">VeraScore Identity</div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 font-mono bg-black/20 px-2 py-1 rounded">ID #{tokenId}</span>
          <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold uppercase tracking-tighter">
            ✦ Verified
          </span>
        </div>
      </div>

      {/* SVG Container */}
      <div className="p-6 bg-polkadot-dark flex justify-center items-center">
        <img
          src={svgDataUrl}
          alt={name}
          className="w-full max-w-[320px] rounded-xl shadow-[0_0_20px_rgba(230,0,122,0.15)] border border-white/5"
          style={{ imageRendering: 'crisp-edges' }}
        />
      </div>

      {/* Footer */}
      <div className="px-5 py-3 flex flex-col gap-1 border-t border-polkadot-border bg-black/10">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-gray-300 font-medium">{name}</span>
          <span className="text-[9px] text-gray-600 font-mono uppercase">Substrate Native</span>
        </div>
        <div className="text-[9px] text-gray-600 italic">
          Fully generated on-chain · No IPFS · Zero external dependencies
        </div>
      </div>
    </div>
  );
}
