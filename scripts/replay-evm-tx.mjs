/**
 * Manually replay an Ethereum Sepolia USDC Transfer tx into the bridge service.
 * Usage:
 *   node scripts/replay-evm-tx.mjs <tx_hash>
 *
 * Example:
 *   node scripts/replay-evm-tx.mjs 0xf7e4b648d6111debaf5b4ffbb6d0c545b836c5421f231ed3702826155400fba7
 */

const RPC_URL = 'https://ethereum-sepolia.publicnode.com';
const USDC_CONTRACT = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const HUB_EVM_ADDRESS = '0xe44eFa504C3833d13f99E69FF6f7Bdf9A3864aFD';
const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const txHash = process.argv[2];
if (!txHash) {
  console.error('Usage: node scripts/replay-evm-tx.mjs <tx_hash>');
  process.exit(1);
}

async function rpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`RPC error: ${body.error.message}`);
  return body.result;
}

console.log(`\nFetching receipt for ${txHash}...`);
const receipt = await rpc('eth_getTransactionReceipt', [txHash]);
if (!receipt) {
  console.error('Transaction not found or not yet mined.');
  process.exit(1);
}
console.log(` Block: ${parseInt(receipt.blockNumber, 16)}, Status: ${receipt.status === '0x1' ? 'SUCCESS' : 'FAILED'}`);

if (receipt.status !== '0x1') {
  console.error('Transaction failed on chain.');
  process.exit(1);
}

// Find USDC Transfer log to Hub
const paddedHub = `0x000000000000000000000000${HUB_EVM_ADDRESS.replace(/^0x/i, '').toLowerCase()}`;
const transferLog = receipt.logs?.find(
  (l) =>
    l.address.toLowerCase() === USDC_CONTRACT.toLowerCase() &&
    l.topics[0] === ERC20_TRANSFER_TOPIC &&
    l.topics[2] === paddedHub,
);

if (!transferLog) {
  console.error(`No USDC Transfer to Hub (${HUB_EVM_ADDRESS}) found in this tx.`);
  console.log('Logs:', JSON.stringify(receipt.logs, null, 2));
  process.exit(1);
}

const amount = BigInt(transferLog.data);
const amountMinor = amount / 10_000n;
const fromAddress = `0x${transferLog.topics[1].slice(-40)}`;
console.log(` From: ${fromAddress}`);
console.log(` Amount: ${(Number(amount) / 1_000_000).toFixed(6)} USDC (${amountMinor} minor cents)`);

// Build the log object matching EvmLog shape
const log = {
  transactionHash: txHash,
  blockNumber: receipt.blockNumber,
  logIndex: transferLog.logIndex,
  topics: transferLog.topics,
  data: transferLog.data,
  address: transferLog.address,
};

console.log('\nPosting to local bridge replay endpoint...');
const res = await fetch('http://localhost:3000/api/bridge/replay', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ log }),
});

const json = await res.json();
if (!res.ok || !json.ok) {
  console.error('Bridge replay failed:', JSON.stringify(json, null, 2));
  process.exit(1);
}
console.log('Bridge replay success:', JSON.stringify(json, null, 2));
