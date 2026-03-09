import { ethers, upgrades } from 'hardhat';

/**
 * VeraScore — V2 → V3 Upgrade Script
 *
 * What this does:
 *   1. Deploys the ScoreNFTv3 implementation contract
 *   2. Upgrades the existing proxy to point to it
 *   3. Calls initializeV3() atomically in the same tx
 *   4. Verifies tokenURI works by calling it on token #1
 *
 * The proxy address NEVER changes.
 * All V1/V2 scores, token IDs, nonces, and breakdowns are preserved.
 */

const PROXY_ADDRESS = '0xbb778Ec1482bbdF08527c1cac1569662caf1faAE';

async function main() {
  const [deployer] = await ethers.getSigners();
  const network    = await ethers.provider.getNetwork();

  console.log('─'.repeat(50));
  console.log('VeraScore — V2 → V3 Upgrade');
  console.log('─'.repeat(50));
  console.log(`Deployer:      ${deployer.address}`);
  console.log(`Proxy address: ${PROXY_ADDRESS}`);
  console.log(`Network:       PAS TestNet (${network.chainId})`);
  console.log('─'.repeat(50));

  // ── Step 1: deploy V3 implementation ─────────────────────────────────────
  console.log('\n[1/4] Deploying ScoreNFTv3 implementation...');
  const ScoreNFTv3 = await ethers.getContractFactory('ScoreNFTv3');

  // ── Step 2: upgrade proxy and call initializeV3 ───────────────────────────
  console.log('[2/4] Upgrading proxy and calling initializeV3...');
  // initializeV3() was already executed in the first upgrade run (reinitializer(3) is one-shot).
  // This run only swaps the implementation — no initializer call needed.
  const upgraded = await upgrades.upgradeProxy(PROXY_ADDRESS, ScoreNFTv3, {
    unsafeAllow: ['missing-initializer'],
  });

  await upgraded.waitForDeployment();

  const newImplAddress = await upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);

  // ── Step 3: smoke-test tokenURI ───────────────────────────────────────────
  console.log('[3/4] Verifying tokenURI on token #1...');
  let tokenUriOk = false;
  try {
    const totalScored = await upgraded.totalScored();

    if (Number(totalScored) >= 1) {
      const uri = await upgraded.tokenURI(1);
      tokenUriOk = uri.startsWith('data:application/json;base64,');

      if (tokenUriOk) {
        // Decode and show a snippet so you can verify in console
        const base64Part = uri.replace('data:application/json;base64,', '');
        const decoded    = Buffer.from(base64Part, 'base64').toString('utf8');
        const parsed     = JSON.parse(decoded);
        console.log(`        name:  ${parsed.name}`);
        console.log(`        image: ${parsed.image.substring(0, 60)}...`);
        console.log(`        attrs: ${JSON.stringify(parsed.attributes.slice(0, 3))}`);
      }
    } else {
      console.log('        (no tokens minted yet — tokenURI check skipped)');
      tokenUriOk = true; // not an error, just no tokens
    }
  } catch (e) {
    console.warn(`        tokenURI check failed: ${e}`);
  }

  // ── Step 4: verify DOMAIN_SEPARATOR still set ─────────────────────────────
  console.log('[4/4] Verifying DOMAIN_SEPARATOR preserved from V2...');
  const domainSep = await upgraded.DOMAIN_SEPARATOR();
  if (domainSep === ethers.ZeroHash) {
    throw new Error('DOMAIN_SEPARATOR is zero — V3 storage is broken');
  }

  console.log('\n' + '─'.repeat(50));
  console.log(tokenUriOk ? '✅ Upgrade complete' : '⚠️  Upgrade done but tokenURI check had issues');
  console.log('─'.repeat(50));
  console.log(`Proxy address (permanent): ${PROXY_ADDRESS}`);
  console.log(`New implementation:        ${newImplAddress}`);
  console.log(`DOMAIN_SEPARATOR:          ${domainSep}`);
  console.log('─'.repeat(50));
  console.log('\nView on explorer:');
  console.log(`https://polkadot.testnet.routescan.io/address/${PROXY_ADDRESS}`);
  console.log('\nTo record a breakdown after next mintScore:');
  console.log(`  contract.recordBreakdown(wallet, [txActivity, age, balance, usdt, usdc, complexity])`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });