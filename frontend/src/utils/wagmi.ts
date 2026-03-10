import { createConfig, http, fallback } from 'wagmi';
import { injected, walletConnect }      from 'wagmi/connectors';
import type { Chain }                   from 'wagmi/chains';

// PRIMARY: confirmed CORS-safe for browser + supports eth_call (contracts)
// FALLBACK: faster for pure state reads but may have CORS issues from browser
export const CONTRACT_RPC_URL = 'https://services.polkadothub-rpc.com/testnet';
export const FAST_RPC_URL     = 'https://pas-rpc.stakeworld.io/assethub';

export const pasTestnet = {
  id:   420420417,
  name: 'Polkadot Hub TestNet',
  nativeCurrency: { name: 'PAS', symbol: 'PAS', decimals: 18 },
  rpcUrls: {
    default: { http: [CONTRACT_RPC_URL] },  // browser-safe primary
    public:  { http: [CONTRACT_RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'Routescan', url: 'https://polkadot.testnet.routescan.io' },
  },
  testnet: true,
} as const satisfies Chain;

export const SCORE_NFT_PROXY =
  import.meta.env.VITE_SCORE_NFT_PROXY as `0x${string}`;

export const USDT_ERC20 = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF07C0' as const satisfies `0x${string}`;
export const USDC_ERC20 = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0539' as const satisfies `0x${string}`;

export const STABLECOIN_DECIMALS = 6;

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

export const wagmiConfig = createConfig({
  chains:          [pasTestnet],
  pollingInterval: 6_000,  // global poll every 6s — matches PAS block time
  transports: {
    // fallback([primary, secondary]) — tries primary, falls back to secondary on error
    [pasTestnet.id]: fallback([
      http(CONTRACT_RPC_URL),   // primary: CORS-safe, supports eth_call
      http(FAST_RPC_URL),       // secondary: faster but may have browser CORS
    ]),
  },
  ssr: false,
  connectors: [
    injected(),
    ...(projectId ? [walletConnect({ projectId })] : []),
  ],
});