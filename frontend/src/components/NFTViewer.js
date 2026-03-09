import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { createPublicClient, http } from 'viem';
const RPC = 'https://services.polkadothub-rpc.com/testnet';
// ABI — only the two read functions we need
const ABI = [
    {
        name: 'tokenIdOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'wallet', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        name: 'tokenURI',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'tokenId', type: 'uint256' }],
        outputs: [{ name: '', type: 'string' }],
    },
];
// ── Decode tokenURI → SVG data URL ────────────────────────────────────────────
// tokenURI returns:  data:application/json;base64,<base64-encoded JSON>
// The JSON contains: { name, description, image: "data:image/svg+xml;base64,..." }
function decodeTokenURI(tokenUri) {
    // Strip the data URI prefix
    const base64Json = tokenUri.replace('data:application/json;base64,', '');
    const jsonStr = atob(base64Json);
    const metadata = JSON.parse(jsonStr);
    const name = metadata.name ?? 'VeraScore NFT';
    const svgDataUrl = metadata.image ?? '';
    if (!svgDataUrl)
        throw new Error('No image in tokenURI metadata');
    return { svgDataUrl, name };
}
export function NFTViewer({ wallet, proxyAddress }) {
    const [state, setState] = useState({ phase: 'loading' });
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
                    address: proxyAddress,
                    abi: ABI,
                    functionName: 'tokenIdOf',
                    args: [wallet],
                });
                if (tokenId === 0n)
                    throw new Error('No NFT found for this wallet');
                // Step 2 — get tokenURI (fully on-chain base64 JSON)
                const uri = await client.readContract({
                    address: proxyAddress,
                    abi: ABI,
                    functionName: 'tokenURI',
                    args: [tokenId],
                });
                // Step 3 — decode base64 JSON → SVG data URL
                const { svgDataUrl, name } = decodeTokenURI(uri);
                if (!cancelled) {
                    setState({
                        phase: 'done',
                        tokenId: tokenId.toString(),
                        svgDataUrl,
                        name,
                    });
                }
            }
            catch (err) {
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
        return (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl p-6 flex flex-col items-center gap-3", children: [_jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest w-full", children: "Your Score NFT" }), _jsxs("div", { className: "flex items-center gap-2 text-sm text-gray-400 py-6", children: [_jsxs("svg", { className: "animate-spin h-4 w-4 text-polkadot-pink", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8v8H4z" })] }), "Loading on-chain NFT metadata..."] })] }));
    }
    // ── Error — silently hide (NFT may not be indexed yet) ─────────────────────
    if (state.phase === 'error') {
        return null;
    }
    // ── Done — render the SVG ───────────────────────────────────────────────────
    const { tokenId, svgDataUrl, name } = state;
    return (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden w-full", children: [_jsxs("div", { className: "px-5 py-3 border-b border-polkadot-border flex items-center justify-between", children: [_jsx("div", { className: "text-xs text-gray-500 uppercase tracking-widest", children: "Your Score NFT" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("span", { className: "text-xs text-gray-600 font-mono", children: ["#", tokenId] }), _jsx("span", { className: "text-xs px-2 py-0.5 rounded-full bg-green-950 border border-green-800 text-green-400 font-semibold", children: "\u2726 On-chain" })] })] }), _jsx("div", { className: "p-4 bg-polkadot-dark", children: _jsx("img", { src: svgDataUrl, alt: name, className: "w-full rounded-xl border border-polkadot-border", style: { imageRendering: 'crisp-edges' } }) }), _jsxs("div", { className: "px-5 py-3 flex items-center justify-between text-xs text-gray-500", children: [_jsx("span", { children: name }), _jsx("span", { className: "text-gray-700", children: "Fully generated on-chain \u00B7 No IPFS \u00B7 No external hosting" })] })] }));
}
