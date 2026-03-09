import { ethers, upgrades } from 'hardhat';

/**
 * Deploy ScoreNFT with UUPS proxy
 * PAS TestNet — Chain ID: 420420417
 *
 * Run:
 *   npx hardhat run scripts/deploy.ts --network polkadotTestnet
 */
async function main() {
  const [deployer] = await ethers.getSigners();

  console.log('Deploying with wallet:', deployer.address);
  console.log('Network: PAS TestNet (Chain ID: 420420417)\n');

  // issuer and owner are both the deployer wallet for now
  const issuerAddress = deployer.address;
  const ownerAddress  = deployer.address;

  console.log('Deploying ScoreNFT implementation + UUPS proxy...');

  const ScoreNFT = await ethers.getContractFactory('ScoreNFT');

  const proxy = await upgrades.deployProxy(
    ScoreNFT,
    [issuerAddress, ownerAddress],
    {
      initializer: 'initialize',
      kind: 'uups',
    }
  );

  await proxy.waitForDeployment();

  const proxyAddress          = await proxy.getAddress();
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log('\n✅ Deployment complete!\n');
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│  SAVE THESE ADDRESSES                                   │');
  console.log('├─────────────────────────────────────────────────────────┤');
  console.log(`│  Proxy (permanent):        ${proxyAddress}  │`);
  console.log(`│  Implementation:           ${implementationAddress}  │`);
  console.log('└─────────────────────────────────────────────────────────┘');
  console.log('\nVerify on explorer:');
  console.log(`https://polkadot.testnet.routescan.io/address/${proxyAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});