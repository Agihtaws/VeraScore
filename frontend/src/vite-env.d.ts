/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SCORE_NFT_PROXY:      string;
  readonly VITE_WALLETCONNECT_PROJECT_ID: string;
  readonly VITE_LENDING_POOL:         string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}