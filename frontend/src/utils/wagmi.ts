import { createConfig, http } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import type { Chain } from 'wagmi/chains';

export const pasTestnet = {
  id:   420420417,
  name: 'Polkadot Hub TestNet',
  nativeCurrency: { name: 'PAS', symbol: 'PAS', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://services.polkadothub-rpc.com/testnet'] },
  },
  blockExplorers: {
    default: { name: 'Routescan', url: 'https://polkadot.testnet.routescan.io' },
  },
  testnet: true,
} as const satisfies Chain;

export const SCORE_NFT_PROXY =
  import.meta.env.VITE_SCORE_NFT_PROXY as `0x${string}`;

// ── Substrate Assets pallet → EVM ERC-20 precompile addresses ──────────────
// Frontier derives these from the integer asset ID:
//   address = 0xFFFFFFFF...FFFF + uint32(assetId) (20 bytes, big-endian)
// USDT asset ID 1984  = 0x000007C0  → 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF07C0
// USDC asset ID 1337  = 0x00000539  → 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0539
export const USDT_ERC20 = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF07C0' as const satisfies `0x${string}`;
export const USDC_ERC20 = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0539' as const satisfies `0x${string}`;

// USDT and USDC both use 6 decimals on Polkadot Hub
export const STABLECOIN_DECIMALS = 6;

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

export const wagmiConfig = createConfig({
  chains:    [pasTestnet],
  transports: {
    [pasTestnet.id]: http('https://services.polkadothub-rpc.com/testnet'),
  },
  ssr: false,
  connectors: [
    injected(),
    ...(projectId ? [walletConnect({ projectId })] : []),
  ],
});