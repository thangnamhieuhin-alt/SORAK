import { AppError } from '@/server/lib/http';
import { getHorizonUrl, usdcCode, usdcIssuer } from './network';

export type AccountState = {
  exists: boolean;
  sequence: string | null;
  xlmBalance: string;
  usdcBalance: string;
  usdcTrustline: boolean;
};

type HorizonAccount = {
  sequence: string;
  balances: Array<{
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
    balance: string;
  }>;
};

async function fetchHorizonAccount(publicKey: string): Promise<HorizonAccount | null> {
  const url = `${getHorizonUrl().replace(/\/$/, '')}/accounts/${publicKey}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new AppError('INTERNAL', `Horizon account lookup failed: ${String(err)}`, 502);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new AppError('INTERNAL', `Horizon returned ${res.status}`, 502);
  return (await res.json()) as HorizonAccount;
}

export async function loadAccountState(publicKey: string): Promise<AccountState> {
  const acct = await fetchHorizonAccount(publicKey);
  if (!acct) {
    return { exists: false, sequence: null, xlmBalance: '0', usdcBalance: '0', usdcTrustline: false };
  }
  let xlmBalance = '0';
  let usdcBalance = '0';
  let usdcTrustline = false;
  for (const b of acct.balances) {
    if (b.asset_type === 'native') xlmBalance = b.balance;
    if (b.asset_code === usdcCode() && b.asset_issuer === usdcIssuer()) {
      usdcTrustline = true;
      usdcBalance = b.balance;
    }
  }
  return { exists: true, sequence: acct.sequence, xlmBalance, usdcBalance, usdcTrustline };
}

export async function loadAccountSequence(publicKey: string): Promise<string> {
  const acct = await fetchHorizonAccount(publicKey);
  if (!acct) throw new AppError('NOT_FOUND', 'Account not found on network', 404);
  return acct.sequence;
}
