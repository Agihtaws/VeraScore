/**
 * deployLending.ts
 *
 * Deploys VeraLendingPool against the already-deployed ScoreNFTv3 proxy,
 * seeds it with an initial PAS reserve, and prints the address.
 *
 * Usage:
 *   npx hardhat run scripts/deployLending.ts --network polkadotTestnet
 *
 * Environment variables required (in contracts/.env):
 *   PRIVATE_KEY          — deployer private key (must hold PAS for gas + seed)
 *   SCORE_NFT_PROXY      — deployed ScoreNFTv3 proxy address
 *   LENDING_SEED_PAS     — (optional) PAS to seed pool on deploy, default "1.0"
 */

import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';

dotenv.config();

const SCORE_NFT_PROXY = process.env.SCORE_NFT_PROXY;
const SEED_PAS        = process.env.LENDING_SEED_PAS ?? '1.0';

async function main() {
  if (!SCORE_NFT_PROXY) {
    throw new Error('SCORE_NFT_PROXY must be set in contracts/.env');
  }

  const [deployer] = await ethers.getSigners();
  const balance    = await ethers.provider.getBalance(deployer.address);

  console.log('──────────────────────────────────────────────────────');
  console.log('  VeraLendingPool — deployment');
  console.log('──────────────────────────────────────────────────────');
  console.log(`  Deployer      : ${deployer.address}`);
  console.log(`  Balance       : ${ethers.formatEther(balance)} PAS`);
  console.log(`  ScoreNFT proxy: ${SCORE_NFT_PROXY}`);
  console.log(`  Pool seed     : ${SEED_PAS} PAS`);
  console.log('──────────────────────────────────────────────────────');

  // ── Deploy ────────────────────────────────────────────────────────────────
  const Factory = await ethers.getContractFactory('VeraLendingPool');
  const pool    = await Factory.deploy(SCORE_NFT_PROXY);
  await pool.waitForDeployment();

  const poolAddress = await pool.getAddress();
  console.log(`\n✅ VeraLendingPool deployed at: ${poolAddress}`);

  // ── Seed initial liquidity ────────────────────────────────────────────────
  const seedWei = ethers.parseEther(SEED_PAS);
  console.log(`\nSeeding pool with ${SEED_PAS} PAS...`);

  const tx = await pool.fundPool({ value: seedWei });
  await tx.wait();

  const liquidity = await pool.poolLiquidity();
  console.log(`✅ Pool funded. Available liquidity: ${ethers.formatEther(liquidity)} PAS`);

  // ── Verify deployment ─────────────────────────────────────────────────────
  const scoreNFTAddr = await pool.scoreNFT();
  console.log(`\nVerification:`);
  console.log(`  scoreNFT() → ${scoreNFTAddr}`);
  console.log(`  Matches expected: ${scoreNFTAddr.toLowerCase() === SCORE_NFT_PROXY.toLowerCase()}`);

  console.log('\n──────────────────────────────────────────────────────');
  console.log('  Add these to your .env files:');
  console.log('──────────────────────────────────────────────────────');
  console.log(`  LENDING_POOL_ADDRESS=${poolAddress}`);
  console.log(`  VITE_LENDING_POOL=${poolAddress}`);
  console.log('──────────────────────────────────────────────────────\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});