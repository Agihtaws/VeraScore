import { Router, Request, Response } from 'express';
import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';
import { cryptoWaitReady, encodeAddress } from '@polkadot/util-crypto';
import { ethers } from 'ethers';
import { createClient } from 'polkadot-api';
import { getWsProvider } from 'polkadot-api/ws-provider/node';
import { withPolkadotSdkCompat } from 'polkadot-api/polkadot-sdk-compat';
import { polkadotTestNet } from '@polkadot-api/descriptors';

export const transferRouter = Router();

const WS_RPC = 'wss://asset-hub-paseo.dotters.network';
const USDT_ID = 1984;
const USDC_ID = 1337;
const DECIMALS = 6;
const SS58_PREFIX = 42;

function evmToSS58(evmAddress: string): string {
  const hex = evmAddress.toLowerCase().replace('0x', '');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 20; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return encodeAddress(bytes, SS58_PREFIX);
}

transferRouter.get('/sender', async (_req: Request, res: Response) => {
  const privateKey = process.env.ISSUER_PRIVATE_KEY;
  if (!privateKey) {
    res.status(500).json({ success: false, error: 'ISSUER_PRIVATE_KEY not configured' });
    return;
  }

  let client: ReturnType<typeof createClient> | null = null;

  try {
    await cryptoWaitReady();

    const keyring = new Keyring({ type: 'sr25519' });
    const sender = keyring.addFromUri(privateKey);
    const ss58 = sender.address;

    client = createClient(withPolkadotSdkCompat(getWsProvider(WS_RPC)));
    const api = client.getTypedApi(polkadotTestNet);

    const [usdtAcc, usdcAcc] = await Promise.all([
      api.query.Assets.Account.getValue(USDT_ID, ss58).catch(() => null),
      api.query.Assets.Account.getValue(USDC_ID, ss58).catch(() => null),
    ]);

    const usdt = usdtAcc ? Number(usdtAcc.balance) / 10 ** DECIMALS : 0;
    const usdc = usdcAcc ? Number(usdcAcc.balance) / 10 ** DECIMALS : 0;

    console.log(`[transfer/sender] ${ss58} — USDT: ${usdt}, USDC: ${usdc}`);
    res.json({ success: true, ss58, usdt, usdc });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[transfer/sender] ❌', msg);
    res.status(500).json({ success: false, error: msg });
  } finally {
    try { client?.destroy(); } catch { }
  }
});

transferRouter.post('/', async (req: Request, res: Response) => {
  const { to, amount, token } = req.body as {
    to: string;
    amount: number;
    token: string;
  };

  if (!to || !ethers.isAddress(to)) {
    res.status(400).json({ success: false, error: 'Invalid recipient EVM address' });
    return;
  }
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    res.status(400).json({ success: false, error: 'Invalid amount' });
    return;
  }
  if (token !== 'USDT' && token !== 'USDC') {
    res.status(400).json({ success: false, error: 'token must be USDT or USDC' });
    return;
  }

  const privateKey = process.env.ISSUER_PRIVATE_KEY;
  if (!privateKey) {
    res.status(500).json({ success: false, error: 'ISSUER_PRIVATE_KEY not configured' });
    return;
  }

  const assetId = token === 'USDT' ? USDT_ID : USDC_ID;
  const amountRaw = Math.round(Number(amount) * 10 ** DECIMALS);
  const recipientSS58 = evmToSS58(to);

  let provider: WsProvider | null = null;
  let api: ApiPromise | null = null;

  try {
    await cryptoWaitReady();

    const keyring = new Keyring({ type: 'sr25519' });
    const sender = keyring.addFromUri(privateKey);

    console.log(`[transfer] Sender:    ${sender.address}`);
    console.log(`[transfer] Recipient: ${to} → ${recipientSS58}`);
    console.log(`[transfer] Amount:    ${amount} ${token} (raw: ${amountRaw})`);

    provider = new WsProvider(WS_RPC);
    api = await ApiPromise.create({ provider });

    const txHash = await new Promise<string>((resolve, reject) => {
      let unsubFn: (() => void) | null = null;

      api!.tx.assets
        .transfer(assetId, recipientSS58, amountRaw)
        .signAndSend(sender, ({ status, dispatchError }) => {
          console.log(`[transfer] Status: ${status.type}`);

          if (dispatchError) {
            let errMsg = dispatchError.toString();
            if (dispatchError.isModule) {
              try {
                const decoded = api!.registry.findMetaError(dispatchError.asModule);
                errMsg = `${decoded.section}.${decoded.name}: ${decoded.docs.join(' ')}`;
              } catch { }
            }
            unsubFn?.();
            reject(new Error(errMsg));
            return;
          }

          if (status.isInBlock) console.log(`[transfer] In block: ${status.asInBlock}`);
          if (status.isFinalized) {
            const hash = status.asFinalized.toString();
            console.log(`[transfer] ✅ Finalized: ${hash}`);
            unsubFn?.();
            resolve(hash);
          }
        })
        .then(u => { unsubFn = u; })
        .catch(reject);
    });

    res.json({
      success: true, txHash,
      from: sender.address, to, recipientSS58,
      amount: Number(amount), token, assetId,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[transfer] ❌`, msg);
    res.status(500).json({ success: false, error: msg });
  } finally {
    try { await api?.disconnect(); } catch { }
    try { await provider?.disconnect(); } catch { }
  }
});