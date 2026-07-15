import {
  Address,
  BASE_FEE,
  Contract,
  nativeToScVal,
  rpc,
  scValToNative,
  StrKey,
  TransactionBuilder,
  type xdr,
} from '@stellar/stellar-sdk';
import { stellar } from '@/server/config/stellar';
import { AppError } from '@/server/lib/http';

const TIER_THRESHOLDS = [500000000n, 1000000000n, 5000000000n];

function server(): rpc.Server {
  return new rpc.Server(stellar.sorobanRpcUrl, {
    allowHttp: stellar.sorobanRpcUrl.startsWith('http://'),
  });
}

function contract(): Contract {
  return new Contract(stellar.contractId);
}

function addr(a: string): xdr.ScVal {
  return new Address(a).toScVal();
}

function i128(stroops: bigint): xdr.ScVal {
  return nativeToScVal(stroops, { type: 'i128' });
}

function mapContractError(raw: string): string {
  const m = raw.match(/Error\(Contract,\s*#(\d+)\)/);
  const code = m ? Number(m[1]) : undefined;
  switch (code) {
    case 1:
      return 'The milestone contract is already initialized.';
    case 2:
      return 'The milestone contract is not initialized yet.';
    case 3:
      return 'Enter a tip amount greater than zero.';
    default:
      break;
  }
  if (/insufficient|underfunded|balance/i.test(raw)) {
    return 'Not enough XLM in your wallet to cover this tip plus the network fee.';
  }
  return 'The contract rejected this tip. Please check the amount and try again.';
}

export function tierForTotal(totalStroops: bigint): number {
  let tier = 0;
  for (const threshold of TIER_THRESHOLDS) {
    if (totalStroops >= threshold) tier += 1;
  }
  return tier;
}

export async function buildRecordTipInvoke(
  supporter: string,
  creator: string,
  amountStroops: bigint,
): Promise<string> {
  if (!StrKey.isValidEd25519PublicKey(supporter)) {
    throw new AppError('INVALID_PUBLIC_KEY', 'Invalid supporter wallet', 400);
  }
  if (!StrKey.isValidEd25519PublicKey(creator)) {
    throw new AppError('INVALID_PUBLIC_KEY', 'Invalid creator wallet', 400);
  }
  const srv = server();
  let account: Awaited<ReturnType<rpc.Server['getAccount']>>;
  try {
    account = await srv.getAccount(supporter);
  } catch {
    throw new AppError(
      'INVALID_INPUT',
      'Your wallet is not funded on testnet yet. Fund it with friendbot first.',
      400,
    );
  }

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: stellar.passphrase,
  })
    .addOperation(contract().call('record_tip', addr(creator), addr(supporter), i128(amountStroops)))
    .setTimeout(180)
    .build();

  let prepared: Awaited<ReturnType<rpc.Server['prepareTransaction']>>;
  try {
    prepared = await srv.prepareTransaction(tx);
  } catch (err) {
    throw new AppError('INVALID_INPUT', mapContractError(String(err)), 400);
  }
  return prepared.toXDR();
}

export type RecordTipSubmit = { hash: string; tier: number };

export async function submitRecordTipXdr(signedXdr: string): Promise<RecordTipSubmit> {
  const srv = server();
  let tx: ReturnType<typeof TransactionBuilder.fromXDR>;
  try {
    tx = TransactionBuilder.fromXDR(signedXdr, stellar.passphrase);
  } catch {
    throw new AppError('INVALID_INPUT', 'Malformed signed transaction', 400);
  }

  let sent: Awaited<ReturnType<rpc.Server['sendTransaction']>>;
  for (let attempt = 0; ; attempt++) {
    try {
      sent = await srv.sendTransaction(tx);
    } catch (err) {
      throw new AppError('INVALID_INPUT', mapContractError(String(err)), 400);
    }
    if (sent.status !== 'TRY_AGAIN_LATER' || attempt >= 3) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (sent.status === 'ERROR') {
    throw new AppError('INVALID_INPUT', mapContractError(JSON.stringify(sent.errorResult ?? '')), 400);
  }

  const deadline = Date.now() + 54_000;
  let got = await srv.getTransaction(sent.hash);
  while (got.status === rpc.Api.GetTransactionStatus.NOT_FOUND && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    got = await srv.getTransaction(sent.hash);
  }

  if (got.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    const detail =
      got.status === rpc.Api.GetTransactionStatus.FAILED
        ? mapContractError(JSON.stringify(got.resultXdr ?? got))
        : 'The tip did not confirm in time. Check the explorer and retry.';
    throw new AppError('INVALID_INPUT', detail, 400);
  }

  let tier = 0;
  try {
    if (got.returnValue) tier = Number(scValToNative(got.returnValue) ?? 0);
  } catch {
    /* the tx still succeeded; tier read is best-effort */
  }
  return { hash: sent.hash, tier };
}

async function readView(source: string, method: string, args: xdr.ScVal[]): Promise<unknown> {
  const srv = server();
  const account = await srv.getAccount(source);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: stellar.passphrase,
  })
    .addOperation(contract().call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await srv.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new AppError('INVALID_INPUT', mapContractError(sim.error), 400);
  }
  const retval = sim.result?.retval;
  return retval ? scValToNative(retval) : null;
}

export async function readTotalGiven(
  source: string,
  creator: string,
  supporter: string,
): Promise<bigint> {
  const v = (await readView(source, 'total_given', [addr(creator), addr(supporter)])) as
    | bigint
    | number
    | null;
  return BigInt(v ?? 0n);
}

export async function readSupporterTier(
  source: string,
  creator: string,
  supporter: string,
): Promise<number> {
  return tierForTotal(await readTotalGiven(source, creator, supporter));
}
