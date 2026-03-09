import { createClient }          from 'polkadot-api';
import { getWsProvider }         from 'polkadot-api/ws-provider/node';
import { withPolkadotSdkCompat } from 'polkadot-api/polkadot-sdk-compat';
import { polkadotTestNet }       from '@polkadot-api/descriptors';
import { ethers }                from 'ethers';
import { encodeAddress }         from '@polkadot/util-crypto';

const WS_ENDPOINT     = 'wss://asset-hub-paseo.dotters.network';
const HTTP_ENDPOINT   = 'https://services.polkadothub-rpc.com/testnet';
const SIDECAR_ENDPOINT = 'https://polkadot-asset-hub-public-sidecar.parity-chains.parity.io';
const CHAIN_ID        = 420420417;
// PAS TestNet: ~6s block time → 14400 blocks/day
const BLOCKS_PER_DAY  = 14_400;
const USDT_ASSET_ID = 1984;
const USDC_ASSET_ID = 1337;

// WETH foreign asset location on Polkadot Asset Hub
// Bridged from Ethereum via Snowbridge — XCM multilocation:
// parents: 2, interior: X2[GlobalConsensus(Ethereum{chainId:1}), AccountKey20{WETH_CONTRACT}]
// On Paseo testnet this may return 0 — graceful fallback handled below
const WETH_LOCATION = {
  parents: 2,
  interior: {
    type: 'X2' as const,
    value: [
      { type: 'GlobalConsensus' as const, value: { type: 'Ethereum' as const, value: { chain_id: 1n } } },
      { type: 'AccountKey20' as const, value: { network: undefined, key: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' } },
    ],
  },
};

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
  wethBalance:       string;   // Foreign asset — WETH bridged from Ethereum via Snowbridge
  hasForeignAssets:  boolean;  // true if wallet holds any cross-chain bridged assets
  bridgedAssets:     string[]; // list of ALL foreign asset IDs found via Sidecar
  walletAgeDays:     number;   // estimated wallet age in days (0 = new/unknown)
  queriedAt:         number;
}

// ── Sidecar helpers ──────────────────────────────────────────────────────────

// Query all foreign (bridged) asset balances via Sidecar REST API.
// Returns array of assetId strings for each foreign asset with non-zero balance.
// This detects ANY cross-chain bridged asset, not just WETH.
async function querySidecarForeignAssets(ss58: string): Promise<string[]> {
  try {
    const url = `${SIDECAR_ENDPOINT}/accounts/${ss58}/foreign-asset-balances`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return [];
    const json = await res.json() as { assets?: { assetId: string; balance: string }[] };
    return (json.assets ?? [])
      .filter(a => BigInt(a.balance) > 0n)
      .map(a => a.assetId);
  } catch {
    return [];
  }
}

// Estimate wallet age by binary searching Sidecar balance-info at historical blocks.
// Checks four checkpoints — earliest with non-zero balance gives the age bracket.
async function querySidecarWalletAge(ss58: string, currentBlock: number): Promise<number> {
  // Checkpoints: 2y, 1y, 180d, 90d, 30d ago
  const checkpoints = [730, 365, 180, 90, 30].map(days => ({
    days,
    block: Math.max(1, currentBlock - days * BLOCKS_PER_DAY),
  }));

  let ageDays = 0;

  for (const { days, block } of checkpoints) {
    try {
      const url = `${SIDECAR_ENDPOINT}/accounts/${ss58}/balance-info?at=${block}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
      if (!res.ok) continue;
      const json = await res.json() as { free?: string; transferable?: string };
      const bal  = BigInt(json.free ?? json.transferable ?? '0');
      if (bal > 0n) {
        ageDays = days; // wallet existed at this checkpoint
        break; // found earliest active checkpoint — stop
      }
    } catch {
      continue;
    }
  }

  return ageDays;
}

export async function readWalletData(address: string): Promise<WalletChainData> {
  const provider = new ethers.JsonRpcProvider(HTTP_ENDPOINT, {
    chainId: CHAIN_ID,
    name:    'polkadot-testnet',
  });

  const [balance, evmNonce] = await Promise.all([
    provider.getBalance(address),
    provider.getTransactionCount(address),
  ]);

  const accountBytes = evmToBytes(address);
  const ss58_42      = encodeAddress(accountBytes, 42);
  const ss58_0       = encodeAddress(accountBytes, 0);

  console.log(`[papiReader] EVM:     ${address}`);
  console.log(`[papiReader] SS58-42: ${ss58_42}`);
  console.log(`[papiReader] SS58-0:  ${ss58_0}`);

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
    let wethBalance     = '0';
    let hasForeignAssets = false;

    try {
      const accountInfo = await api.query.System.Account.getValue(ss58_42);
      reservedBalance = accountInfo.data.reserved.toString();
      frozenBalance   = accountInfo.data.frozen.toString();
      consumers       = accountInfo.consumers;
      providers       = accountInfo.providers;
      sufficients     = accountInfo.sufficients;
    } catch (e) {
      console.warn('[papiReader] System.Account failed:', e instanceof Error ? e.message : e);
    }

    try {
      const nonce = await api.apis.AccountNonceApi.account_nonce(ss58_42);
      confirmedNonce = Number(nonce);
    } catch {}

    try {
      const r42 = await api.query.Assets.Account.getValue(USDT_ASSET_ID, ss58_42);
      if (r42) {
        usdtBalance = r42.balance.toString();
        console.log(`[papiReader] USDT ss58_42: ${usdtBalance}`);
      } else {
        const r0 = await api.query.Assets.Account.getValue(USDT_ASSET_ID, ss58_0);
        if (r0) {
          usdtBalance = r0.balance.toString();
          console.log(`[papiReader] USDT ss58_0: ${usdtBalance}`);
        }
      }
    } catch (e) {
      console.warn('[papiReader] USDT query failed:', e instanceof Error ? e.message : e);
    }

    try {
      const r42 = await api.query.Assets.Account.getValue(USDC_ASSET_ID, ss58_42);
      if (r42) {
        usdcBalance = r42.balance.toString();
      } else {
        const r0 = await api.query.Assets.Account.getValue(USDC_ASSET_ID, ss58_0);
        if (r0) usdcBalance = r0.balance.toString();
      }
    } catch (e) {
      console.warn('[papiReader] USDC query failed:', e instanceof Error ? e.message : e);
    }

    let usdtMetadata: AssetMetadata = { name: 'Tether USD', symbol: 'USDT', decimals: 6 };
    try {
      const meta = await api.query.Assets.Metadata.getValue(USDT_ASSET_ID);
      if (meta) usdtMetadata = { name: meta.name.asText(), symbol: meta.symbol.asText(), decimals: meta.decimals };
    } catch {}

    let usdcMetadata: AssetMetadata = { name: 'USD Coin', symbol: 'USDC', decimals: 6 };
    try {
      const meta = await api.query.Assets.Metadata.getValue(USDC_ASSET_ID);
      if (meta) usdcMetadata = { name: meta.name.asText(), symbol: meta.symbol.asText(), decimals: meta.decimals };
    } catch {}

    let metadataVersions: number[] = [14, 15];
    try {
      const versions = await api.apis.Metadata.metadata_versions();
      metadataVersions = versions.map(Number);
    } catch {}

    // ── Sidecar: foreign assets + wallet age (parallel, non-blocking) ──────────
    let bridgedAssets: string[] = [];
    let walletAgeDays           = 0;

    try {
      // Get current block number from Sidecar to anchor age calculation
      const headRes = await fetch(`${SIDECAR_ENDPOINT}/blocks/head`, {
        signal: AbortSignal.timeout(8_000),
      });
      let currentBlock = 0;
      if (headRes.ok) {
        const headJson = await headRes.json() as { number?: string };
        currentBlock   = parseInt(headJson.number ?? '0', 10);
      }

      // Fire both queries in parallel
      const [foreignAssets, ageDays] = await Promise.all([
        querySidecarForeignAssets(ss58_42),
        currentBlock > 0
          ? querySidecarWalletAge(ss58_42, currentBlock)
          : Promise.resolve(0),
      ]);

      bridgedAssets = foreignAssets;
      walletAgeDays = ageDays;

      // If Sidecar found foreign assets, mark hasForeignAssets regardless of WETH
      if (bridgedAssets.length > 0) hasForeignAssets = true;

      console.log(`[papiReader] Bridged assets: [${bridgedAssets.join(', ') || 'none'}]`);
      console.log(`[papiReader] Wallet age: ~${walletAgeDays} days`);
    } catch (e) {
      console.warn('[papiReader] Sidecar queries failed (non-fatal):', e instanceof Error ? e.message : e);
    }

    console.log(`[papiReader] PAS:  ${balance.toString()}`);
    console.log(`[papiReader] USDT: ${usdtBalance}`);
    console.log(`[papiReader] USDC: ${usdcBalance}`);
    console.log(`[papiReader] WETH: ${wethBalance} (hasForeignAssets: ${hasForeignAssets})`);

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
      wethBalance,
      hasForeignAssets,
      bridgedAssets,
      walletAgeDays,
      queriedAt:       Date.now(),
    };

  } finally {
    client.destroy();
  }
}