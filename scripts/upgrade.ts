import { ethers, upgrades } from 'hardhat';

/**
 * Upgrade script — V1 → V2
 *
 * This script:
 *  1. Deploys the new ScoreNFTv2 implementation
 *  2. Upgrades the existing proxy to point to it
 *  3. Calls initializeV2() to set the EIP-712 domain separator
 *
 * The proxy address NEVER changes.
 * All existing V1 scores and token IDs are preserved.
 */

const PROXY_ADDRESS = '0xbb778Ec1482bbdF08527c1cac1569662caf1faAE';

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log('─'.repeat(50));
  console.log('VeraScore — V1 → V2 Upgrade');
  console.log('─'.repeat(50));
  console.log(`Deployer:      ${deployer.address}`);
  console.log(`Proxy address: ${PROXY_ADDRESS}`);
  console.log(`Network:       PAS TestNet (${(await ethers.provider.getNetwork()).chainId})`);
  console.log('─'.repeat(50));

  // Deploy new implementation and upgrade the proxy
  console.log('\n[1/3] Deploying ScoreNFTv2 implementation...');
  const ScoreNFTv2 = await ethers.getContractFactory('ScoreNFTv2');

  console.log('[2/3] Upgrading proxy and calling initializeV2...');
  const upgraded = await upgrades.upgradeProxy(PROXY_ADDRESS, ScoreNFTv2, {
    call: { fn: 'initializeV2' }, // calls reinitializer(2) atomically in the upgrade tx
  });

  await upgraded.waitForDeployment();

  const newImplAddress = await upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);

  console.log('[3/3] Verifying upgrade...');

  // Verify domain separator was set
  const domainSeparator = await upgraded.DOMAIN_SEPARATOR();
  if (domainSeparator === ethers.ZeroHash) {
    throw new Error('DOMAIN_SEPARATOR not set — initializeV2 may have failed');
  }

  console.log('\n' + '─'.repeat(50));
  console.log('✅ Upgrade complete');
  console.log('─'.repeat(50));
  console.log(`Proxy address (permanent): ${PROXY_ADDRESS}`);
  console.log(`New implementation:        ${newImplAddress}`);
  console.log(`DOMAIN_SEPARATOR:          ${domainSeparator}`);
  console.log('─'.repeat(50));
  console.log(`\nView on explorer:`);
  console.log(`https://polkadot.testnet.routescan.io/address/${PROXY_ADDRESS}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Upgrade failed:', err);
    process.exit(1);
  });