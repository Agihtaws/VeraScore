import { Router, Request, Response } from 'express';
import { ethers }                    from 'ethers';
import { readWalletData }            from '../chain/papiReader.js';

export const feeInfoRouter = Router();

const RPC_URL  = 'https://services.polkadothub-rpc.com/testnet';
const CHAIN_ID = 420420417;

// PAS TestNet gas constants
// Minimum PAS needed to cover gas — 0.05 PAS buffer
const MIN_PAS_FOR_GAS_WEI = 50_000_000_000_000_000n; // 0.05 PAS
// Fallback gas if estimation fails
const GAS_FALLBACK        = 300_000n;
// 20% safety buffer multiplier on top of estimated gas
const GAS_BUFFER_PCT      = 120n; // 120% = 20% headroom

// mintScore ABI fragment — needed for calldata encoding
const MINT_SCORE_ABI = [
  'function mintScore(address wallet, uint16 score, bytes32 dataHash, uint256 deadline, bytes calldata signature) external',
];

// Dummy values for gas estimation — real args not needed for gas estimate
// (any valid-looking calldata gives accurate gas measurement)
const DUMMY_SCORE     = 500;
const DUMMY_DATAHASH  = '0x' + '11'.repeat(32);
const DUMMY_DEADLINE  = Math.floor(Date.now() / 1000) + 3600;
const DUMMY_SIG       = '0x' + '22'.repeat(65);

// ─────────────────────────────────────────────────────────────────────────────
// USDT fee payment — Polkadot Asset Hub native feature
//
// On Polkadot Asset Hub (and PAS TestNet), any sufficient asset can pay
// transaction fees for Substrate extrinsics. USDT (asset ID 1984) is a
// sufficient asset, meaning wallets with ONLY USDT and no PAS can still
// submit transactions.
//
// XCM MultiLocation for USDT on PAS TestNet:
//   { parents: 0, interior: X2[PalletInstance(50), GeneralIndex(1984)] }
//
// This is used with polkadot-api signAndSubmit({ asset: USDT_ASSET_LOCATION })
// as demonstrated in the Polkadot docs for fee payment with custom assets.
//
// NOTE: This works for Substrate extrinsics (polkadot-api). For EVM transactions
// via MetaMask, PAS is still required. Wallets using Substrate-native tooling
// (Talisman, PolkadotJS) can use USDT fees directly.
// ─────────────────────────────────────────────────────────────────────────────
const USDT_ASSET_LOCATION = {
  parents: 0,
  interior: {
    type:  'X2',
    value: [
      { type: 'PalletInstance', value: 50     },  // Assets pallet
      { type: 'GeneralIndex',   value: 1984   },  // USDT asset ID
    ],
  },
};

const USDT_ASSET_ID = 1984;
const USDT_DECIMALS = 6;

// ─────────────────────────────────────────────────────────────────────────────
// GET /fee-info/:address
//
// Returns fee payment options for a given address.
// Uses PAPI to read both PAS (System.Account) and USDT (Assets.Account)
// balances — the same queries used in papiReader.ts.
//
// Determines:
//   - hasSufficientPas    — can pay gas via MetaMask/EVM path
//   - canUseUsdtForFees   — has USDT and could use Substrate fee payment
//   - recommendedPath     — 'evm' | 'substrate-usdt' | 'insufficient'
//   - gasEstimateUsd      — estimated fee in USD (using PAS price estimate)
//   - usdtAssetLocation   — exact XCM location for polkadot-api signAndSubmit
//
// This endpoint is the backend declaration of USDT fee payment support.
// Any frontend or SDK integration can query this before deciding which
// transaction path to use.
// ─────────────────────────────────────────────────────────────────────────────
feeInfoRouter.get('/:address', async (req: Request, res: Response) => {
  const raw = req.params.address;

  if (!ethers.isAddress(raw)) {
    res.status(400).json({ success: false, error: 'Invalid wallet address' });
    return;
  }

  const address = raw.toLowerCase();

  try {
    // ── Step 1: Read balances via PAPI (System.Account + Assets.Account) ──────
    console.log(`[fee-info] Reading chain data for ${address}...`);
    const chainData = await readWalletData(address);
    console.log(`[fee-info] PAS free: ${chainData.freeBalance}, USDT: ${chainData.usdtBalance}`);

    // ── Step 2: Get current gas price + estimate real gas for mintScore() ──────
    const provider = new ethers.JsonRpcProvider(RPC_URL, {
      chainId: CHAIN_ID,
      name:    'polkadot-testnet',
    });

    // Get live gas price
    let gasPrice = 1_000_000_000n; // 1 gwei fallback
    try {
      const feeData = await provider.getFeeData();
      if (feeData.gasPrice) gasPrice = feeData.gasPrice;
    } catch {
      console.warn('[fee-info] Could not fetch gas price, using fallback 1 gwei');
    }

    // Estimate actual gas for mintScore() using eth_estimateGas with encoded calldata.
    // This is far more accurate than the hardcoded 300k — actual usage is ~120–150k.
    // We use dummy args because gas depends on code path, not the actual values.
    const proxyAddress = process.env.SCORE_NFT_PROXY;
    let gasEstimate = GAS_FALLBACK;

    if (proxyAddress) {
      try {
        const iface    = new ethers.Interface(MINT_SCORE_ABI);
        const calldata = iface.encodeFunctionData('mintScore', [
          address,
          DUMMY_SCORE,
          DUMMY_DATAHASH,
          DUMMY_DEADLINE,
          DUMMY_SIG,
        ]);

        const rawEstimate = await provider.estimateGas({
          to:   proxyAddress,
          data: calldata,
          from: address,
        });

        // Add 20% buffer for safety
        gasEstimate = (BigInt(rawEstimate) * GAS_BUFFER_PCT) / 100n;
        console.log(`[fee-info] Gas estimated: ${rawEstimate} raw → ${gasEstimate} with buffer`);
      } catch (e) {
        // May revert with CooldownActive or similar — still useful as estimate
        console.warn(`[fee-info] Gas estimation failed, using fallback: ${e instanceof Error ? e.message : e}`);
        gasEstimate = GAS_FALLBACK;
      }
    }

    // ── Step 3: Calculate exact PAS cost for mintScore() ─────────────────────
    const gasCostWei   = gasEstimate * gasPrice;
    const freeBalWei   = BigInt(chainData.freeBalance);
    const usdtBalance  = BigInt(chainData.usdtBalance);

    const hasSufficientPas  = freeBalWei >= MIN_PAS_FOR_GAS_WEI;
    const hasUsdt           = usdtBalance > 0n;

    // USDT fee path available when: has USDT AND insufficient PAS
    // (If they have both PAS + USDT, EVM path is simpler)
    const canUseUsdtForFees = hasUsdt && !hasSufficientPas;

    // Recommended path decision
    let recommendedPath: 'evm' | 'substrate-usdt' | 'insufficient';
    if (hasSufficientPas) {
      recommendedPath = 'evm';
    } else if (canUseUsdtForFees) {
      recommendedPath = 'substrate-usdt';
    } else {
      recommendedPath = 'insufficient';
    }

    // Human-readable gas cost (approximate, PAS price not real-time)
    const gasCostPas = Number(gasCostWei) / 1e18;

    // USDT balance in human units (6 decimals)
    const usdtHuman = Number(usdtBalance) / 10 ** USDT_DECIMALS;

    // Estimated USDT fee cost for Substrate path (typically < $0.01 on Asset Hub)
    // This is the fee the chain charges when using USDT as fee token
    const estimatedUsdtFee = 0.01; // ~0.01 USDT on PAS TestNet

    res.json({
      success:   true,
      address,

      // ── Balances ────────────────────────────────────────────────────────────
      pas: {
        wei:           chainData.freeBalance,
        human:         (Number(freeBalWei) / 1e18).toFixed(6),
        reserved:      chainData.reservedBalance,
        frozen:        chainData.frozenBalance,
      },
      usdt: {
        raw:           chainData.usdtBalance,
        human:         usdtHuman.toFixed(2),
        assetId:       USDT_ASSET_ID,
        decimals:      USDT_DECIMALS,
        metadata:      chainData.usdtMetadata,
      },

      // ── Fee analysis ────────────────────────────────────────────────────────
      hasSufficientPas,
      canUseUsdtForFees,
      recommendedPath,

      // ── Gas estimate (EVM path) ──────────────────────────────────────────────
      evm: {
        gasEstimate:   gasEstimate.toString(),
        gasPriceWei:   gasPrice.toString(),
        gasCostWei:    gasCostWei.toString(),
        gasCostPas:    gasCostPas.toFixed(8),
        minPasRequired: MIN_PAS_FOR_GAS_WEI.toString(),
      },

      // ── USDT fee path (Substrate / polkadot-api) ─────────────────────────────
      //
      // Pass this `usdtAssetLocation` as the `asset` field in polkadot-api
      // signAndSubmit() to pay fees with USDT instead of PAS.
      //
      // Example:
      //   await tx.signAndSubmit(signer, { asset: usdtAssetLocation });
      //
      substrate: {
        usdtAssetId:       USDT_ASSET_ID,
        usdtAssetLocation: USDT_ASSET_LOCATION,
        estimatedUsdtFee:  estimatedUsdtFee,
        note: 'Substrate-native fee payment. Works with polkadot-api signAndSubmit({ asset }). ' +
              'For EVM transactions via MetaMask, PAS is required.',
      },

      // ── Recommendation ────────────────────────────────────────────────────
      recommendation: recommendedPath === 'evm'
        ? 'Use MetaMask (EVM path). Sufficient PAS for gas.'
        : recommendedPath === 'substrate-usdt'
        ? `Use polkadot-api with USDT fee payment. Pass substrate.usdtAssetLocation as the asset parameter in signAndSubmit().`
        : 'Insufficient funds. Acquire PAS or USDT on PAS TestNet.',

      // ── Chain context ────────────────────────────────────────────────────
      network:   'PAS TestNet',
      chainId:   CHAIN_ID,
      queriedAt: chainData.queriedAt,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[fee-info] ❌ Error for ${address}:`, err);
    res.status(500).json({ success: false, error: msg });
  }
});