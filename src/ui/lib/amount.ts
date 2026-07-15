const TESTNET_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
const PUBLIC_NETWORK_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

export const TIP_MIN = 0.5;
export const TIP_MAX = 50;

export function networkPassphrase(): string {
  return process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'testnet'
    ? TESTNET_NETWORK_PASSPHRASE
    : PUBLIC_NETWORK_PASSPHRASE;
}

export function formatTipAmount(amount: string | number): string {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(value);
}

export function sumAsNumber(...values: (string | number | null | undefined)[]): number {
  return values.reduce<number>((acc, v) => acc + (Number(v) || 0), 0);
}

export function isValidTipAmount(amount: string): boolean {
  const value = Number(amount);
  return Number.isFinite(value) && value >= TIP_MIN && value <= TIP_MAX;
}

export function testnetTxUrl(hash: string): string {
  return `https://stellar.expert/explorer/public/tx/${hash}`;
}

export function testnetAccountUrl(publicKey: string): string {
  return `https://stellar.expert/explorer/public/account/${publicKey}`;
}
