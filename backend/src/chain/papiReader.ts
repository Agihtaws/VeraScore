import { createClient }          from 'polkadot-api';
import { getWsProvider }         from 'polkadot-api/ws-provider/node';
import { withPolkadotSdkCompat } from 'polkadot-api/polkadot-sdk-compat';
import { polkadotTestNet }       from '@polkadot-api/descriptors';
import { ethers }                from 'ethers';
import { encodeAddress }         from '@polkadot/util-crypto';

const WS_ENDPOINT     = 'wss://asset-hub-paseo.dotters.network';
const HTTP_ENDPOINT   = 'https://services.polkadothub-rpc.com/testnet';
const CHAIN_ID        = 420420417;
const USDT_ASSET_ID   = 1984;
const USDC_ASSET_ID   = 1337;

function evmToBytes(evmAddress: string): Uint8Array {
  const clean  = evmAddress.toLowerCase().replace('0x', '');
  const padded = clean + '000000000000000000000000';
  const bytes  = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export interface AssetMetadata {
  name:     string;
  symbol:   string;
  decimals: number;
}

export interface WalletChainData {
  address:          string;
  nonce:            number;
  freeBalance:      string;
  usdtBalance:      string;
  usdcBalance:      string;
  reservedBalance:  string;
  frozenBalance:    string;
  consumers:        number;
  providers:        number;
  sufficients:      number;
  confirmedNonce:   number;
  usdtMetadata:     AssetMetadata;
  usdcMetadata:     AssetMetadata;
  metadataVersions:  number[];
  wethBalance:       string;
  hasForeignAssets:  boolean;
  bridgedAssets:     string[];
  walletAgeDays:     number;
  queriedAt:         number;
}

export async function readWalletData(address: string): Promise<WalletChainData> {
  const provider = new ethers.JsonRpcProvider(HTTP_ENDPOINT, {
  chainId: CHAIN_ID,
  name:    'polkadot-testnet',
}, { staticNetwork: true });


  // Rapid fire the basic EVM data
  const [balance, evmNonce] = await Promise.all([
    provider.getBalance(address),
    provider.getTransactionCount(address),
  ]);

  const accountBytes = evmToBytes(address);
  const ss58_42      = encodeAddress(accountBytes, 42);

  const client = createClient(
    withPolkadotSdkCompat(getWsProvider(WS_ENDPOINT))
  );
  const api = client.getTypedApi(polkadotTestNet);

  try {
    let reservedBalance = '0';
    let frozenBalance   = '0';
    let consumers       = 0;
    let providers       = 0;
    let sufficients     = 0;
    let confirmedNonce  = evmNonce;
    let usdtBalance     = '0';
    let usdcBalance     = '0';

    // 1. Get System Account Info
    try {
      const accountInfo = await api.query.System.Account.getValue(ss58_42);
      if (accountInfo) {
        reservedBalance = accountInfo.data.reserved.toString();
        frozenBalance   = accountInfo.data.frozen.toString();
        consumers       = accountInfo.consumers;
        providers       = accountInfo.providers;
        sufficients     = accountInfo.sufficients;
      }
    } catch {}

    // 2. Get confirmed Nonce
    try {
      const nonce = await api.apis.AccountNonceApi.account_nonce(ss58_42);
      confirmedNonce = Number(nonce);
    } catch {}

    // 3. Get USDT Balance
    try {
      const r42 = await api.query.Assets.Account.getValue(USDT_ASSET_ID, ss58_42);
      if (r42) usdtBalance = r42.balance.toString();
    } catch {}

    // 4. Get USDC Balance
    try {
      const r42 = await api.query.Assets.Account.getValue(USDC_ASSET_ID, ss58_42);
      if (r42) usdcBalance = r42.balance.toString();
    } catch {}

    // Metadata & Versions
    let usdtMetadata: AssetMetadata = { name: 'Tether USD', symbol: 'USDT', decimals: 6 };
    let usdcMetadata: AssetMetadata = { name: 'USD Coin', symbol: 'USDC', decimals: 6 };
    let metadataVersions: number[] = [14, 15];

    try {
      const [uMeta, cMeta, versions] = await Promise.all([
        api.query.Assets.Metadata.getValue(USDT_ASSET_ID),
        api.query.Assets.Metadata.getValue(USDC_ASSET_ID),
        api.apis.Metadata.metadata_versions()
      ]);
      if (uMeta) usdtMetadata = { name: uMeta.name.asText(), symbol: uMeta.symbol.asText(), decimals: uMeta.decimals };
      if (cMeta) usdcMetadata = { name: cMeta.name.asText(), symbol: cMeta.symbol.asText(), decimals: cMeta.decimals };
      if (versions) metadataVersions = versions.map(Number);
    } catch {}

    const bridgedAssets: string[] = [];
    const walletAgeDays           = 0;
    const hasForeignAssets        = false;

    console.log(`[papiReader] Done for ${address} (USDT: ${usdtBalance})`);

    return {
      address,
      nonce:           evmNonce,
      freeBalance:     balance.toString(),
      usdtBalance,
      usdcBalance,
      reservedBalance,
      frozenBalance,
      consumers,
      providers,
      sufficients,
      confirmedNonce,
      usdtMetadata,
      usdcMetadata,
      metadataVersions,
      wethBalance: '0',
      hasForeignAssets,
      bridgedAssets,
      walletAgeDays,
      queriedAt:       Date.now(),
    };

  } finally {
    client.destroy();
  }
}
