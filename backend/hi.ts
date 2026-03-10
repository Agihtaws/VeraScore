import { createClient } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws-provider/node';
import { withPolkadotSdkCompat } from 'polkadot-api/polkadot-sdk-compat';
import { polkadotTestNet } from '@polkadot-api/descriptors';

const WS_RPC = 'wss://asset-hub-paseo.dotters.network';
const USDT_ID = 1984;

// Your two SS58 addresses
const EVM_MAPPED_SS58 = '5EKjVJhcPyGCWpQ1GM2qhqz7JikbsDPJouwXAeVaYQ3hkRaf';
const NATIVE_SS58     = '5FKtWP3sCkpEFefcoRyXQzPYvVX3a42mJTPvRfqQJ9qnEZL8';

async function check(api: any, address: string, label: string) {
  const assetAccount = await api.query.Assets.Account.getValue(USDT_ID, address);
  const balance = assetAccount ? Number(assetAccount.balance) / 1e6 : 0;
  console.log(`${label} (${address}): ${balance} USDT`);
}

async function main() {
  const client = createClient(withPolkadotSdkCompat(getWsProvider(WS_RPC)));
  const api = client.getTypedApi(polkadotTestNet);

  console.log('--- Current Balances ---');
  await check(api, EVM_MAPPED_SS58, 'Account 0x63 (EVM Slot)   ');
  await check(api, NATIVE_SS58,     'Account 0x63 (Native Slot)');
  await check(api, '5CarWaWMrcKd2Wija18EaA7kwqKV1NCvPv7vkX9JetKF3e5c', 'Recipient 0x16 (EVM Slot)');

  client.destroy();
}

main().catch(console.error);
