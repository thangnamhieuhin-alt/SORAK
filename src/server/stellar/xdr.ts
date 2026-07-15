import {
  Account,
  type Asset,
  BASE_FEE,
  type Keypair,
  Memo,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { AppError } from '@/server/lib/http';
import { getHorizonUrl, getNetworkPassphrase } from './network';

const DEFAULT_TIMEOUT_SEC = 180;

export type BuildPaymentInput = {
  sourcePublicKey: string;
  destinationPublicKey: string;
  asset: Asset;
  amount: string;
  memo?: { type: 'text' | 'id' | 'hash' | 'return'; value: string };
  timeoutSec?: number;
  sourceSequence?: string;
};

/**
 * Build an unsigned payment transaction. Returned as base64 XDR; the caller
 * (e.g. Freighter in the browser, or a server hot wallet) signs and submits.
 *
 * `sourceSequence` is required because the server does not always have an
 * up-to-date view of the source account (especially if the wallet is
 * hosted elsewhere). Pass `null` to let the SDK fetch from Horizon.
 */
export async function buildPaymentXdr(input: BuildPaymentInput): Promise<string> {
  let account: Account;
  try {
    if (input.sourceSequence) {
      account = new Account(input.sourcePublicKey, input.sourceSequence);
    } else {
      const acct = await fetchAccount(input.sourcePublicKey);
      account = new Account(input.sourcePublicKey, acct.sequenceNumber);
    }
  } catch (err) {
    if ((err as Error).message === 'NOT_FOUND') {
      throw new AppError('NOT_FOUND', 'Source account not found on network', 404);
    }
    throw err;
  }

  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkPassphrase(),
  }).addOperation(
    Operation.payment({
      destination: input.destinationPublicKey,
      asset: input.asset,
      amount: input.amount,
    }),
  );

  const memo = input.memo;
  if (memo) {
    switch (memo.type) {
      case 'text':
        builder.addMemo(Memo.text(memo.value));
        break;
      case 'id':
        builder.addMemo(Memo.id(memo.value));
        break;
      case 'hash':
        builder.addMemo(Memo.hash(memo.value));
        break;
      case 'return':
        builder.addMemo(Memo.return(memo.value));
        break;
    }
  }

  const tx = builder.setTimeout(input.timeoutSec ?? DEFAULT_TIMEOUT_SEC).build();
  return tx.toXDR();
}

/**
 * Submit a signed transaction XDR to Horizon. Returns the transaction hash.
 */
export async function submitTransaction(
  signedTxXdr: string,
): Promise<{ hash: string; ledger: number }> {
  const url = `${getHorizonUrl().replace(/\/$/, '')}/transactions`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ tx: signedTxXdr }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new AppError('INTERNAL', `Horizon submit failed: ${String(err)}`, 502);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new AppError('INTERNAL', `Horizon submit returned ${res.status}: ${body}`, 502);
  }
  const data = (await res.json()) as { hash: string; ledger: number };
  return { hash: data.hash, ledger: data.ledger };
}

async function fetchAccount(publicKey: string): Promise<{ sequenceNumber: string }> {
  const url = `${getHorizonUrl().replace(/\/$/, '')}/accounts/${publicKey}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new AppError('INTERNAL', `Horizon loadAccount failed: ${String(err)}`, 502);
  }
  if (res.status === 404) {
    throw new Error('NOT_FOUND');
  }
  if (!res.ok) {
    throw new AppError('INTERNAL', `Horizon loadAccount returned ${res.status}`, 502);
  }
  const data = (await res.json()) as { sequence: string };
  if (typeof data.sequence !== 'string' || data.sequence.length === 0) {
    // Defensive: an account that exists on Horizon should always carry a
    // `sequence` field. If it's missing/empty, surface a 502 so the caller
    // sees something useful instead of an opaque "sequence must be of type
    // string" TypeError from the SDK constructor.
    throw new AppError('INTERNAL', 'Horizon account response missing `sequence`', 502);
  }
  return { sequenceNumber: data.sequence };
}

/**
 * Parse and validate a signed transaction. The caller is expected to have
 * already verified the signature against a known signer.
 */
export function parseTransaction(signedTxXdr: string) {
  try {
    return TransactionBuilder.fromXDR(signedTxXdr, getNetworkPassphrase());
  } catch {
    throw new AppError('INVALID_INPUT', 'Could not parse signed transaction XDR', 400);
  }
}

/** Sign a transaction with a server-held keypair. Used in tests and the mock anchor path. */
export function signTransaction(unsignedTxXdr: string, signer: Keypair): string {
  const tx = TransactionBuilder.fromXDR(unsignedTxXdr, getNetworkPassphrase());
  tx.sign(signer);
  return tx.toXDR();
}
