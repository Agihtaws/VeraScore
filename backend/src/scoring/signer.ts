import { ethers }               from 'ethers';
import type { WalletChainData } from '../chain/papiReader.js';
import type { ScoreResult }     from './mistralScorer.js';

// Switch back to this RPC for signing because it supports contract calls pa!
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
  expiresAt:       number; 
}

export async function buildSignedPayload(
  walletAddress: string,
  scoreResult:   ScoreResult,
  chainData:     WalletChainData
): Promise<SignedScorePayload> {
  const privateKey = process.env.ISSUER_PRIVATE_KEY;
  const proxyAddress = process.env.SCORE_NFT_PROXY;

  const normalizedWallet = walletAddress.toLowerCase();
  const provider = new ethers.JsonRpcProvider(RPC_URL, {
    chainId: CHAIN_ID,
    name:    'polkadot-testnet',
  }, { staticNetwork: true });

  const contract = new ethers.Contract(proxyAddress!, SCORE_NFT_ABI, provider);

  // Fetching nonces and contract data
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
    name: 'VeraScore',
    version: '1',
    chainId: CHAIN_ID,
    verifyingContract: proxyAddress,
  };

  const computedDs = ethers.TypedDataEncoder.hashDomain(domain);
  const issuerWallet = new ethers.Wallet(privateKey!, provider);

  const value = {
    wallet:   normalizedWallet,
    score:    scoreResult.score,
    dataHash: dataHash,
    nonce:    currentNonce,
    deadline: BigInt(deadline),
  };

  const signature = await issuerWallet.signTypedData(domain, EIP712_TYPES, value);

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
    expiresAt:       Math.floor(Date.now() / 1000) + 2 * 3600,
  };
}
