import { ethers, upgrades } from 'hardhat';

/**
 * VeraScore — Testnet Timing Upgrade
 *
 * Changes EXPIRY_DURATION: 30 days → 2 hours
 * Changes COOLDOWN_DURATION: 7 days → 5 minutes
 *
 * PROXY ADDRESS NEVER CHANGES.
 * All existing scores, tokens, balances preserved.
 *
 * Run: npm run upgrade:testnet
 */

const PROXY_ADDRESS = '0xbb778Ec1482bbdF08527c1cac1569662caf1faAE';

async function main() {
  const [deployer] = await ethers.getSigners();
  const network    = await ethers.provider.getNetwork();

  console.log('─'.repeat(55));
  console.log('VeraScore — Testnet Timing Upgrade');
  console.log('  EXPIRY_DURATION:   30 days  → 2 hours');
  console.log('  COOLDOWN_DURATION:  7 days  → 5 minutes');
  console.log('─'.repeat(55));
  console.log(`Deployer:      ${deployer.address}`);
  console.log(`Proxy:         ${PROXY_ADDRESS}`);
  console.log(`Network:       ${network.chainId}`);
  console.log('─'.repeat(55));

  // Pre-flight: check current constants on-chain
  const before = await ethers.getContractAt('ScoreNFTv3', PROXY_ADDRESS);
  const expiryBefore   = await before.EXPIRY_DURATION();
  const cooldownBefore = await before.COOLDOWN_DURATION();
  console.log(`\nBefore — EXPIRY: ${Number(expiryBefore)}s (${Number(expiryBefore)/86400}d)  COOLDOWN: ${Number(cooldownBefore)}s`);

  // Deploy new implementation + upgrade proxy
  console.log('\n[1/3] Deploying new ScoreNFTv3 implementation...');
  const ScoreNFTv3 = await ethers.getContractFactory('ScoreNFTv3');

  console.log('[2/3] Upgrading proxy (no re-initialiser needed)...');
  const upgraded = await upgrades.upgradeProxy(PROXY_ADDRESS, ScoreNFTv3, {
    unsafeAllow: ['missing-initializer'],
  });
  await upgraded.waitForDeployment();

  const newImpl = await upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);

  // Verify new constants
  console.log('[3/3] Verifying new constants on-chain...');
  const expiryAfter   = await upgraded.EXPIRY_DURATION();
  const cooldownAfter = await upgraded.COOLDOWN_DURATION();
  console.log(`After  — EXPIRY: ${Number(expiryAfter)}s (${Number(expiryAfter)/3600}h)  COOLDOWN: ${Number(cooldownAfter)}s (${Number(cooldownAfter)/60}m)`);

  const expiryOk   = Number(expiryAfter)   === 7200;   // 2 hours
  const cooldownOk = Number(cooldownAfter) === 300;    // 5 minutes

  console.log('\n' + '─'.repeat(55));
  if (expiryOk && cooldownOk) {
    console.log('✅ Upgrade complete — testnet timings active');
  } else {
    console.log('⚠️  Constants not as expected — check implementation');
    console.log(`   EXPIRY expected 7200, got ${expiryAfter}`);
    console.log(`   COOLDOWN expected 300, got ${cooldownAfter}`);
  }
  console.log('─'.repeat(55));
  console.log(`Proxy (permanent): ${PROXY_ADDRESS}`);
  console.log(`New implementation: ${newImpl}`);
  console.log(`\nExplorer: https://polkadot.testnet.routescan.io/address/${PROXY_ADDRESS}`);
  console.log('─'.repeat(55));
  console.log('\n⚠️  Remember to revert to production timings before mainnet:');
  console.log('   EXPIRY_DURATION   = 30 days');
  console.log('   COOLDOWN_DURATION =  7 days');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });