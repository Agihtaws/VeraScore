import { ethers }               from 'ethers';
import type { WalletChainData } from '../chain/papiReader.js';
import type { ScoreResult }     from './mistralScorer.js';

const RPC_URL  = 'https://services.polkadothub-rpc.com/testnet';
const CHAIN_ID = 420420417;

const SCORE_NFT_ABI = [
  'function nonces(address wallet) external view returns (uint256)',
  'function hasScore(address wallet) external view returns (bool)',
  'function issuer() external view returns (address)',
  'function DOMAIN_SEPARATOR() external view returns (bytes32)',
];

const EIP712_TYPES = {
  Score: [
    { name: 'wallet',   type: 'address' },
    { name: 'score',    type: 'uint16'  },
    { name: 'dataHash', type: 'bytes32' },
    { name: 'nonce',    type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

export interface SignedScorePayload {
  wallet:          string;
  score:           number;
  dataHash:        string;
  signature:       string;
  deadline:        number;
  nonce:           number;
  reasoning:       string;
  breakdown:       ScoreResult['breakdown'];
  rawChainData:    WalletChainData;
  alreadyHadScore: boolean;
}

export async function buildSignedPayload(
  walletAddress: string,
  scoreResult:   ScoreResult,
  chainData:     WalletChainData
): Promise<SignedScorePayload> {
  const privateKey = process.env.ISSUER_PRIVATE_KEY;
  if (!privateKey)  throw new Error('ISSUER_PRIVATE_KEY not set in .env');

  const proxyAddress = process.env.SCORE_NFT_PROXY;
  if (!proxyAddress) throw new Error('SCORE_NFT_PROXY not set in .env');

  const normalizedWallet = walletAddress.toLowerCase();

  const provider     = new ethers.JsonRpcProvider(RPC_URL, {
    chainId: CHAIN_ID,
    name:    'polkadot-testnet',
  });
  const issuerWallet = new ethers.Wallet(privateKey, provider);
  const contract     = new ethers.Contract(proxyAddress, SCORE_NFT_ABI, provider);

  const [currentNonce, alreadyHadScore, contractIssuer, contractDs] = await Promise.all([
    contract.nonces(normalizedWallet),
    contract.hasScore(normalizedWallet),
    contract.issuer(),
    contract.DOMAIN_SEPARATOR(),
  ]);

  const dataHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({
    chainData:   chainData,
    scoreResult: scoreResult,
    scoredAt:    new Date().toISOString(),
  })));

  const deadline = Math.floor(Date.now() / 1000) + 3600;

  const domain = {
    name:              'VeraScore',
    version:           '1',
    chainId:           CHAIN_ID,
    verifyingContract: proxyAddress,
  };

  // What backend computes as domain separator
  const computedDs = ethers.TypedDataEncoder.hashDomain(domain);

  // ── Debug logging ────────────────────────────────────────
  console.log('[signer] ── DEBUG ──────────────────────────────');
  console.log(`[signer] Issuer wallet:   ${issuerWallet.address}`);
  console.log(`[signer] Contract issuer: ${contractIssuer}`);
  console.log(`[signer] Issuers match:   ${issuerWallet.address.toLowerCase() === contractIssuer.toLowerCase()}`);
  console.log(`[signer] Contract DS:     ${contractDs}`);
  console.log(`[signer] Computed DS:     ${computedDs}`);
  console.log(`[signer] DS match:        ${contractDs === computedDs}`);
  console.log(`[signer] On-chain nonce:  ${currentNonce}`);
  console.log(`[signer] Deadline:        ${new Date(deadline * 1000).toISOString()}`);
  console.log('[signer] ───────────────────────────────────────');

  const value = {
    wallet:   normalizedWallet,
    score:    scoreResult.score,
    dataHash: dataHash,
    nonce:    currentNonce,
    deadline: BigInt(deadline),
  };

  const signature = await issuerWallet.signTypedData(domain, EIP712_TYPES, value);

  console.log(`[signer] ✅ Signature ready`);

  return {
    wallet:          normalizedWallet,
    score:           scoreResult.score,
    dataHash,
    signature,
    deadline,
    nonce:           Number(currentNonce),
    reasoning:       scoreResult.reasoning,
    breakdown:       scoreResult.breakdown,
    rawChainData:    chainData,
    alreadyHadScore: Boolean(alreadyHadScore),
  };
}