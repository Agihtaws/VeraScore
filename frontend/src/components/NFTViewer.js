import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
import { createPublicClient, http } from 'viem';
const RPC = 'https://services.polkadothub-rpc.com/testnet';
const ABI = [
    {
        name: 'tokenIdOf', type: 'function', stateMutability: 'view',
        inputs: [{ name: 'wallet', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
    },
    {
        name: 'tokenURI', type: 'function', stateMutability: 'view',
        inputs: [{ name: 'tokenId', type: 'uint256' }],
        outputs: [{ name: '', type: 'string' }],
    },
];
function decodeTokenURI(tokenUri) {
    const base64Json = tokenUri.replace('data:application/json;base64,', '');
    const jsonStr = atob(base64Json);
    const metadata = JSON.parse(jsonStr);
    const name = metadata.name ?? 'VeraScore NFT';
    const svgDataUrl = metadata.image ?? '';
    if (!svgDataUrl)
        throw new Error('No image field in NFT metadata');
    return { svgDataUrl, name };
}
export function NFTViewer({ wallet, proxyAddress, label = 'Score NFT', initialDelay = 1500 }) {
    const [state, setState] = useState({ phase: 'loading' });
    const [attempt, setAttempt] = useState(0);
    const retry = useCallback(() => { setState({ phase: 'loading' }); setAttempt(a => a + 1); }, []);
    useEffect(() => {
        let cancelled = false;
        async function fetchNFT() {
            setState({ phase: 'loading' });
            try {
                const client = createPublicClient({ transport: http(RPC) });
                const tokenId = await client.readContract({
                    address: proxyAddress, abi: ABI, functionName: 'tokenIdOf', args: [wallet],
                });
                if (tokenId === 0n) {
                    if (!cancelled)
                        setState({ phase: 'no-nft' });
                    return;
                }
                const uri = await client.readContract({
                    address: proxyAddress, abi: ABI, functionName: 'tokenURI', args: [tokenId],
                });
                const { svgDataUrl, name } = decodeTokenURI(uri);
                if (!cancelled)
                    setState({ phase: 'done', tokenId: tokenId.toString(), svgDataUrl, name });
            }
            catch (err) {
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
        return (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl px-4 py-3 flex items-center gap-3", children: [_jsxs("svg", { className: "animate-spin h-3.5 w-3.5 text-polkadot-pink shrink-0", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8v8H4z" })] }), _jsxs("div", { children: [_jsx("div", { className: "text-[9px] font-bold uppercase tracking-widest text-gray-600", children: label }), _jsx("div", { className: "text-xs text-gray-500 mt-0.5", children: "Fetching on-chain SVG\u2026" })] })] }));
    }
    if (state.phase === 'no-nft')
        return null;
    if (state.phase === 'error') {
        return (_jsxs("div", { className: "bg-polkadot-card border border-yellow-800/30 rounded-2xl px-4 py-3 space-y-1.5", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-[9px] font-bold uppercase tracking-widest text-gray-600", children: label }), _jsx("span", { className: "text-[9px] text-yellow-600", children: "RPC fetch failed" })] }), _jsx("div", { className: "text-[10px] text-gray-600 font-mono break-all", children: state.message }), _jsx("button", { onClick: retry, className: "text-[9px] font-bold text-polkadot-pink hover:opacity-70 underline underline-offset-2 transition-opacity", children: "Retry" })] }));
    }
    const { tokenId, svgDataUrl, name } = state;
    return (_jsxs("div", { className: "bg-polkadot-card border border-polkadot-border rounded-2xl overflow-hidden", children: [_jsxs("div", { className: "px-4 py-3 border-b border-polkadot-border bg-black/20 flex items-center justify-between", children: [_jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-gray-500", children: label }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("span", { className: "text-[9px] font-mono text-gray-600", children: ["#", tokenId] }), _jsx("span", { className: "text-[8px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/5 border border-emerald-500/20 text-emerald-400", children: "\u2726 On-chain SVG" })] })] }), _jsx("div", { className: "p-3 bg-polkadot-dark", children: _jsx("img", { src: svgDataUrl, alt: name, className: "w-full rounded-xl border border-polkadot-border", style: { imageRendering: 'crisp-edges' } }) }), _jsxs("div", { className: "px-4 py-2.5 flex items-center justify-between", children: [_jsx("span", { className: "text-[9px] text-gray-600", children: name }), _jsx("span", { className: "text-[9px] text-gray-700", children: "No IPFS \u00B7 No external hosting" })] })] }));
}
