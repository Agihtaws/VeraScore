import { createConfig, http, fallback } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
export const CONTRACT_RPC_URL = 'https://services.polkadothub-rpc.com/testnet';
export const FAST_RPC_URL = 'https://pas-rpc.stakeworld.io/assethub';
export const pasTestnet = {
    id: 420420417,
    name: 'Polkadot Hub TestNet',
    nativeCurrency: { name: 'PAS', symbol: 'PAS', decimals: 18 },
    rpcUrls: {
        default: { http: [CONTRACT_RPC_URL] },
        public: { http: [CONTRACT_RPC_URL] },
    },
    blockExplorers: {
        default: { name: 'Routescan', url: 'https://polkadot.testnet.routescan.io' },
    },
    testnet: true,
};
export const SCORE_NFT_PROXY = import.meta.env.VITE_SCORE_NFT_PROXY;
export const USDT_ERC20 = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF07C0';
export const USDC_ERC20 = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0539';
export const STABLECOIN_DECIMALS = 6;
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';
export const wagmiConfig = createConfig({
    chains: [pasTestnet],
    pollingInterval: 6_000,
    transports: {
        [pasTestnet.id]: fallback([
            http(CONTRACT_RPC_URL),
            http(FAST_RPC_URL),
        ]),
    },
    ssr: false,
    connectors: [
        injected(),
        ...(projectId ? [walletConnect({ projectId })] : []),
    ],
});
