import { useState, useEffect, useCallback } from 'react';
import { createPublicClient, http } from 'viem';

const RPC = 'https://services.polkadothub-rpc.com/testnet';

const ABI = [
  {
    name: 'tokenIdOf', type: 'function', stateMutability: 'view',
    inputs:  [{ name: 'wallet',  type: 'address' }],
    outputs: [{ name: '',        type: 'uint256' }],
  },
  {
    name: 'tokenURI', type: 'function', stateMutability: 'view',
    inputs:  [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '',        type: 'string'  }],
  },
] as const;

interface Props {
  wallet:        string;
  proxyAddress:  `0x${string}`;
  label?:        string;
  initialDelay?: number;
}

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'no-nft' }
  | { phase: 'done'; tokenId: string; svgDataUrl: string; name: string };

function decodeTokenURI(tokenUri: string): { svgDataUrl: string; name: string } {
  const base64Json = tokenUri.replace('data:application/json;base64,', '');
  const jsonStr    = atob(base64Json);
  const metadata   = JSON.parse(jsonStr) as { name?: string; image?: string };
  const name       = metadata.name ?? 'VeraScore NFT';
  const svgDataUrl = metadata.image ?? '';
  if (!svgDataUrl) throw new Error('No image field in NFT metadata');
  return { svgDataUrl, name };
}

export function NFTViewer({ wallet, proxyAddress, label = 'Score NFT', initialDelay = 1500 }: Props) {
  const [state,   setState]   = useState<State>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => { setState({ phase: 'loading' }); setAttempt(a => a + 1); }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchNFT() {
      setState({ phase: 'loading' });
      try {
        const client = createPublicClient({ transport: http(RPC) });
        const tokenId = await client.readContract({
          address: proxyAddress, abi: ABI, functionName: 'tokenIdOf', args: [wallet as `0x${string}`],
        });
        if (tokenId === 0n) { if (!cancelled) setState({ phase: 'no-nft' }); return; }
        const uri = await client.readContract({
          address: proxyAddress, abi: ABI, functionName: 'tokenURI', args: [tokenId],
        });
        const { svgDataUrl, name } = decodeTokenURI(uri as string);
        if (!cancelled) setState({ phase: 'done', tokenId: tokenId.toString(), svgDataUrl, name });
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'RPC call failed';
          console.warn('[NFTViewer]', msg);
          setState({ phase: 'error', message: msg });
        }
      }
    }
    const t = setTimeout(fetchNFT, attempt === 0 ? initialDelay : 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [wallet, proxyAddress, attempt, initialDelay]);

  if (state.phase === 'loading') {
    return (
      <div className="bg-polkadot-card border border-polkadot-border rounded-2xl px-4 py-3 flex items-center gap-3">
        <svg className="animate-spin h-3.5 w-3.5 text-polkadot-pink shrink-0" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-gray-600">{label}</div>
          <div className="text-xs text-gray-500 mt-0.5">Fetching on-chain SVG…</div>
        </div>
      </div>
    );
  }

  if (state.phase === 'no-nft') return null;

  if (state.phase === 'error') {
    return (
      <div className="bg-polkadot-card border border-yellow-800/30 rounded-2xl px-4 py-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600">{label}</span>
          <span className="text-[9px] text-yellow-600">RPC fetch failed</span>
        </div>
        <div className="text-[10px] text-gray-600 font-mono break-all">{state.message}</div>
        <button onClick={retry}
          className="text-[9px] font-bold text-polkadot-pink hover:opacity-70 underline underline-offset-2 transition-opacity">
          Retry
        </button>
      </div>
    );
  }

  const { tokenId, svgDataUrl, name } = state;

  return (
    <div className="bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-polkadot-border bg-black/20 flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono text-gray-600">#{tokenId}</span>
          <span className="text-[8px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/5 border border-emerald-500/20 text-emerald-400">
            ✦ On-chain SVG
          </span>
        </div>
      </div>

      {/* NFT image */}
      <div className="p-3 bg-polkadot-dark">
        <img src={svgDataUrl} alt={name}
          className="w-full rounded-xl border border-polkadot-border"
          style={{ imageRendering: 'crisp-edges' }} />
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 flex items-center justify-between">
        <span className="text-[9px] text-gray-600">{name}</span>
        <span className="text-[9px] text-gray-700">No IPFS · No external hosting</span>
      </div>
    </div>
  );
}