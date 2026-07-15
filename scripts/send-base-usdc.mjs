/**
 * Simulate a customer paying USDC on Ethereum Sepolia to the Hub.
 * Usage:
 *   node scripts/send-base-usdc.mjs <amount_usd> [customer_private_key]
 *
 * Example (send $1 USDC):
 *   node scripts/send-base-usdc.mjs 1
 *
 * If no customer_private_key is provided, generates a new wallet and
 * prints the address so you can fund it first.
 */

import pkg from 'ethers';
const { Wallet, Contract, providers } = pkg;
const { JsonRpcProvider } = providers;

const BASE_RPC = 'https://ethereum-sepolia.publicnode.com';
const USDC_CONTRACT = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const HUB_EVM_ADDRESS = '0xe44eFa504C3833d13f99E69FF6f7Bdf9A3864aFD';

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

const amountUsd = parseFloat(process.argv[2] || '1');
const customerKey = process.argv[3];

if (!customerKey) {
  const w = Wallet.createRandom();
  console.log('\n No customer private key provided. Generated a test wallet:');
  console.log(' Address:     ', w.address);
  console.log(' Private Key: ', w.privateKey);
  console.log('\n Fund it with:');
  console.log('  ETH (gas): https://faucets.chain.link/sepolia  or  https://sepoliafaucet.com');
  console.log('  USDC:      https://faucet.circle.com  (select Ethereum Sepolia)');
  console.log('\n Then run:');
  console.log(`  node scripts/send-base-usdc.mjs ${amountUsd} ${w.privateKey}`);
  process.exit(0);
}

const provider = new JsonRpcProvider(BASE_RPC);
const signer = new Wallet(customerKey, provider);
const usdc = new Contract(USDC_CONTRACT, ERC20_ABI, signer);

const decimals = await usdc.decimals();
const amountUnits = BigInt(Math.round(amountUsd * 10 ** Number(decimals)));
const balance = await usdc.balanceOf(signer.address);

console.log(`\n Customer wallet: ${signer.address}`);
console.log(` USDC balance:    ${(Number(balance) / 10 ** Number(decimals)).toFixed(6)} USDC`);
console.log(` Sending:         ${amountUsd} USDC → Hub ${HUB_EVM_ADDRESS}`);

if (balance < amountUnits) {
  console.error(`\n Insufficient USDC balance. Have ${balance}, need ${amountUnits}`);
  console.error(' Get USDC from: https://faucet.circle.com (select Ethereum Sepolia)');
  process.exit(1);
}

console.log('\n Submitting transaction...');
const tx = await usdc.transfer(HUB_EVM_ADDRESS, amountUnits);
console.log(` Tx hash: ${tx.hash}`);
console.log(` Explorer: https://sepolia.etherscan.io/tx/${tx.hash}`);

const receipt = await tx.wait();
console.log(` Confirmed in block ${receipt.blockNumber}`);
console.log('\n Server will detect this within ~12 seconds and bridge to Stellar.');
