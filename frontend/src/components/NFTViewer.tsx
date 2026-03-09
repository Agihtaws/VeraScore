import { useState, useEffect } from 'react';
import { createPublicClient, http } from 'viem';

const RPC = 'https://services.polkadothub-rpc.com/testnet';

// ABI — only the two read functions we need
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

// ── Decode tokenURI → SVG data URL ────────────────────────────────────────────
// tokenURI returns:  data:application/json;base64,<base64-encoded JSON>
// The JSON contains: { name, description, image: "data:image/svg+xml;base64,..." }
function decodeTokenURI(tokenUri: string): { svgDataUrl: string; name: string } {
  // Strip the data URI prefix
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

        if (tokenId === 0n) throw new Error('No NFT found for this wallet');

        // Step 2 — get tokenURI (fully on-chain base64 JSON)
        const uri = await client.readContract({
          address:      proxyAddress,
          abi:          ABI,
          functionName: 'tokenURI',
          args:         [tokenId],
        });

        // Step 3 — decode base64 JSON → SVG data URL
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

    // Small delay so the chain has time to index the new mint
    const t = setTimeout(fetchNFT, 2000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [wallet, proxyAddress]);

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (state.phase === 'loading') {
    return (
      <div className="bg-polkadot-card border border-polkadot-border rounded-2xl p-6 flex flex-col items-center gap-3">
        <div className="text-xs text-gray-500 uppercase tracking-widest w-full">Your Score NFT</div>
        <div className="flex items-center gap-2 text-sm text-gray-400 py-6">
          <svg className="animate-spin h-4 w-4 text-polkadot-pink" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Loading on-chain NFT metadata...
        </div>
      </div>
    );
  }

  // ── Error — silently hide (NFT may not be indexed yet) ─────────────────────
  if (state.phase === 'error') {
    return null;
  }

  // ── Done — render the SVG ───────────────────────────────────────────────────
  const { tokenId, svgDataUrl, name } = state;

  return (
    <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden w-full">

      {/* Header */}
      <div className="px-5 py-3 border-b border-polkadot-border flex items-center justify-between">
        <div className="text-xs text-gray-500 uppercase tracking-widest">Your Score NFT</div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600 font-mono">#{tokenId}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-950 border border-green-800 text-green-400 font-semibold">
            ✦ On-chain
          </span>
        </div>
      </div>

      {/* SVG render — directly from contract tokenURI, no IPFS */}
      <div className="p-4 bg-polkadot-dark">
        <img
          src={svgDataUrl}
          alt={name}
          className="w-full rounded-xl border border-polkadot-border"
          style={{ imageRendering: 'crisp-edges' }}
        />
      </div>

      {/* Footer */}
      <div className="px-5 py-3 flex items-center justify-between text-xs text-gray-500">
        <span>{name}</span>
        <span className="text-gray-700">Fully generated on-chain · No IPFS · No external hosting</span>
      </div>
    </div>
  );
}