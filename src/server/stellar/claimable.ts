import {
  Account,
  Asset,
  BASE_FEE,
  Claimant,
  Memo,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { AppError } from '@/server/lib/http';
import { loadAccountSequence } from './account';
import { getHorizonUrl, getNetworkPassphrase, usdcAsset } from './network';

const DEFAULT_TIMEOUT_SEC = 300;

export type TipAsset = 'XLM' | 'USDC';

export function resolveAsset(asset: TipAsset): Asset {
  return asset === 'USDC' ? usdcAsset() : Asset.native();
}

export type BuildClaimableBalanceInput = {
  sourcePublicKey: string;
  claimantPublicKey: string;
  asset: TipAsset;
  amount: string;
  memo?: string;
};

/**
 * Build an unsigned create-claimable-balance transaction. The fan is the
 * source; the creator is the sole claimant with an unconditional predicate,
 * so the creator can claim any time — even before their account is funded.
 * This is how tips reach a creator who has not connected a wallet yet.
 */
export async function buildCreateClaimableBalanceXdr(
  input: BuildClaimableBalanceInput,
): Promise<string> {
  const sequence = await loadAccountSequence(input.sourcePublicKey);
  const account = new Account(input.sourcePublicKey, sequence);
  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkPassphrase(),
  }).addOperation(
    Operation.createClaimableBalance({
      asset: resolveAsset(input.asset),
      amount: input.amount,
      claimants: [new Claimant(input.claimantPublicKey, Claimant.predicateUnconditional())],
    }),
  );
  if (input.memo) builder.addMemo(Memo.text(input.memo.slice(0, 28)));
  return builder.setTimeout(DEFAULT_TIMEOUT_SEC).build().toXDR();
}

export type BuildClaimInput = {
  claimantPublicKey: string;
  balanceId: string;
  asset: TipAsset;
  addTrustline: boolean;
};

/**
 * Build an unsigned claim transaction for the creator. When the balance is a
 * non-native asset and the creator lacks the trustline, a changeTrust op is
 * prepended so the creator is never stranded at op_no_trust.
 */
export async function buildClaimClaimableBalanceXdr(input: BuildClaimInput): Promise<string> {
  const sequence = await loadAccountSequence(input.claimantPublicKey);
  const account = new Account(input.claimantPublicKey, sequence);
  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkPassphrase(),
  });
  if (input.asset === 'USDC' && input.addTrustline) {
    builder.addOperation(Operation.changeTrust({ asset: usdcAsset() }));
  }
  builder.addOperation(Operation.claimClaimableBalance({ balanceId: input.balanceId }));
  return builder.setTimeout(DEFAULT_TIMEOUT_SEC).build().toXDR();
}

type EffectsResponse = {
  _embedded: { records: Array<{ type: string; balance_id?: string }> };
};

/**
 * Read the claimable_balance_created effect from a submitted transaction to
 * recover the on-chain balance id (the value a claimant needs to claim it).
 */
export async function getClaimableBalanceIdFromTx(txHash: string): Promise<string | null> {
  const url = `${getHorizonUrl().replace(/\/$/, '')}/transactions/${txHash}/effects?limit=50`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new AppError('INTERNAL', `Horizon effects lookup failed: ${String(err)}`, 502);
  }
  if (!res.ok) return null;
  const data = (await res.json()) as EffectsResponse;
  const created = data._embedded.records.find(
    (r) => r.type === 'claimable_balance_created' && r.balance_id,
  );
  return created?.balance_id ?? null;
}
