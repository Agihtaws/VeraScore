import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { readWalletData } from '../chain/papiReader.js';

export const feeInfoRouter = Router();

const RPC_URL = 'https://services.polkadothub-rpc.com/testnet';
const CHAIN_ID = 420420417;

const MIN_PAS_FOR_GAS_WEI = 50_000_000_000_000_000n;
const GAS_FALLBACK = 300_000n;
const GAS_BUFFER_PCT = 120n;

const MINT_SCORE_ABI = [
  'function mintScore(address wallet, uint16 score, bytes32 dataHash, uint256 deadline, bytes calldata signature) external',
];

const DUMMY_SCORE = 500;
const DUMMY_DATAHASH = '0x' + '11'.repeat(32);
const DUMMY_DEADLINE = Math.floor(Date.now() / 1000) + 3600;
const DUMMY_SIG = '0x' + '22'.repeat(65);
const USDT_ASSET_LOCATION = {
  parents: 0,
  interior: {
    type: 'X2',
    value: [
      { type: 'PalletInstance', value: 50 },
      { type: 'GeneralIndex', value: 1984 },
    ],
  },
};

const USDT_ASSET_ID = 1984;
const USDT_DECIMALS = 6;
feeInfoRouter.get('/:address', async (req: Request, res: Response) => {
  const raw = req.params.address;

  if (!ethers.isAddress(raw)) {
    res.status(400).json({ success: false, error: 'Invalid wallet address' });
    return;
  }

  const address = raw.toLowerCase();

  try {
    console.log(`[fee-info] Reading chain data for ${address}...`);
    const chainData = await readWalletData(address);
    console.log(`[fee-info] PAS free: ${chainData.freeBalance}, USDT: ${chainData.usdtBalance}`);

    const provider = new ethers.JsonRpcProvider(RPC_URL, {
      chainId: CHAIN_ID,
      name: 'polkadot-testnet',
    });

    let gasPrice = 1_000_000_000n;
    try {
      const feeData = await provider.getFeeData();
      if (feeData.gasPrice) gasPrice = feeData.gasPrice;
    } catch {
      console.warn('[fee-info] Could not fetch gas price, using fallback 1 gwei');
    }

    const proxyAddress = process.env.SCORE_NFT_PROXY;
    let gasEstimate = GAS_FALLBACK;

    if (proxyAddress) {
      try {
        const iface = new ethers.Interface(MINT_SCORE_ABI);
        const calldata = iface.encodeFunctionData('mintScore', [
          address,
          DUMMY_SCORE,
          DUMMY_DATAHASH,
          DUMMY_DEADLINE,
          DUMMY_SIG,
        ]);

        const rawEstimate = await provider.estimateGas({
          to: proxyAddress,
          data: calldata,
          from: address,
        });

        gasEstimate = (BigInt(rawEstimate) * GAS_BUFFER_PCT) / 100n;
        console.log(`[fee-info] Gas estimated: ${rawEstimate} raw → ${gasEstimate} with buffer`);
      } catch (e) {
        
        console.warn(`[fee-info] Gas estimation failed, using fallback: ${e instanceof Error ? e.message : e}`);
        gasEstimate = GAS_FALLBACK;
      }
    }

    const gasCostWei = gasEstimate * gasPrice;
    const freeBalWei = BigInt(chainData.freeBalance);
    const usdtBalance = BigInt(chainData.usdtBalance);

    const hasSufficientPas = freeBalWei >= MIN_PAS_FOR_GAS_WEI;
    const hasUsdt = usdtBalance > 0n;

    const canUseUsdtForFees = hasUsdt && !hasSufficientPas;

    let recommendedPath: 'evm' | 'substrate-usdt' | 'insufficient';
    if (hasSufficientPas) {
      recommendedPath = 'evm';
    } else if (canUseUsdtForFees) {
      recommendedPath = 'substrate-usdt';
    } else {
      recommendedPath = 'insufficient';
    }

    const gasCostPas = Number(gasCostWei) / 1e18;

    const usdtHuman = Number(usdtBalance) / 10 ** USDT_DECIMALS;
    const estimatedUsdtFee = 0.01;

    res.json({
      success: true,
      address,

      pas: {
        wei: chainData.freeBalance,
        human: (Number(freeBalWei) / 1e18).toFixed(6),
        reserved: chainData.reservedBalance,
        frozen: chainData.frozenBalance,
      },
      usdt: {
        raw: chainData.usdtBalance,
        human: usdtHuman.toFixed(2),
        assetId: USDT_ASSET_ID,
        decimals: USDT_DECIMALS,
        metadata: chainData.usdtMetadata,
      },

      hasSufficientPas,
      canUseUsdtForFees,
      recommendedPath,

      evm: {
        gasEstimate: gasEstimate.toString(),
        gasPriceWei: gasPrice.toString(),
        gasCostWei: gasCostWei.toString(),
        gasCostPas: gasCostPas.toFixed(8),
        minPasRequired: MIN_PAS_FOR_GAS_WEI.toString(),
      },

      substrate: {
        usdtAssetId: USDT_ASSET_ID,
        usdtAssetLocation: USDT_ASSET_LOCATION,
        estimatedUsdtFee: estimatedUsdtFee,
        note: 'Substrate-native fee payment. Works with polkadot-api signAndSubmit({ asset }). For EVM transactions via MetaMask, PAS is required.',
      },

      recommendation: recommendedPath === 'evm'
        ? 'Use MetaMask (EVM path). Sufficient PAS for gas.'
        : recommendedPath === 'substrate-usdt'
        ? `Use polkadot-api with USDT fee payment. Pass substrate.usdtAssetLocation as the asset parameter in signAndSubmit().`
        : 'Insufficient funds. Acquire PAS or USDT on PAS TestNet.',

      network: 'PAS TestNet',
      chainId: CHAIN_ID,
      queriedAt: chainData.queriedAt,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[fee-info] ❌ Error for ${address}:`, err);
    res.status(500).json({ success: false, error: msg });
  }
});