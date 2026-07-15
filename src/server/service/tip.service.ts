import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { env } from '@/server/config/env';
import { db } from '@/server/db/client';
import { type Creator } from '@/server/db/schema/creators';
import { type Tip, TIP_STATUSES, type TipMethod, type TipStatus, tips } from '@/server/db/schema/tips';
import { eventBus } from '@/server/lib/eventBus';
import { AppError } from '@/server/lib/http';
import { Asset, StrKey } from '@stellar/stellar-sdk';
import {
  buildClaimClaimableBalanceXdr,
  buildCreateClaimableBalanceXdr,
  getClaimableBalanceIdFromTx,
  type TipAsset,
} from '@/server/stellar/claimable';
import { usdcAsset } from '@/server/stellar/network';
import { buildPaymentXdr } from '@/server/stellar/xdr';
import { getTransaction } from '@/server/stellar/tx';
import { milestoneContractEnabled } from '@/server/config/stellar';
import { buildRecordTipInvoke, submitRecordTipXdr } from '@/server/stellar/milestone-contract';
import { creatorService } from './creator.service';
import { milestoneService, type MilestoneReach } from './milestone.service';

function displayToStroops(display: string): bigint {
  const [whole, frac = ''] = display.split('.');
  const fracPadded = `${frac}0000000`.slice(0, 7);
  return BigInt(whole || '0') * 10_000_000n + BigInt(fracPadded || '0');
}

const CONFIRMED_STATES: TipStatus[] = ['confirmed', 'claimable', 'claimed'];

/** Allowed forward transitions for a tip. Anything not listed throws. */
export const TIP_TRANSITIONS: Record<TipStatus, TipStatus[]> = {
  pending: ['submitted', 'failed'],
  submitted: ['confirmed', 'claimable', 'failed'],
  claimable: ['claimed', 'failed'],
  confirmed: [],
  claimed: [],
  failed: [],
};

export function assertTransition(from: TipStatus, to: TipStatus): void {
  if (!TIP_STATUSES.includes(to)) {
    throw new AppError('INVALID_INPUT', `Unknown tip status: ${to}`, 400);
  }
  if (!TIP_TRANSITIONS[from].includes(to)) {
    throw new AppError('CONFLICT', `Illegal tip transition ${from} -> ${to}`, 409);
  }
}

function validateAmount(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new AppError('INVALID_INPUT', 'Tip amount must be a positive number', 400);
  }
  if (n < Number(env.TIP_MIN_AMOUNT)) {
    throw new AppError('INVALID_INPUT', `Minimum tip is ${env.TIP_MIN_AMOUNT}`, 400);
  }
  if (n > Number(env.TIP_MAX_AMOUNT)) {
    throw new AppError('INVALID_INPUT', `Maximum tip is ${env.TIP_MAX_AMOUNT}`, 400);
  }
  return n.toFixed(7).replace(/\.?0+$/, '') || '0';
}

function validatePublicKey(key: string): string {
  if (!StrKey.isValidEd25519PublicKey(key)) {
    throw new AppError('INVALID_PUBLIC_KEY', 'Stellar public key is invalid', 400);
  }
  return key;
}

export type BuildTipInput = {
  handle: string;
  fanPublicKey: string;
  asset: TipAsset;
  amount: string;
  message?: string;
};

export type BuildTipResult = {
  method: TipMethod;
  xdr: string;
  asset: TipAsset;
  amount: string;
  destination: string;
  network: string;
  contract?: boolean;
};

/**
 * Decide the on-chain path for a tip and return an unsigned XDR the fan signs.
 * A funded creator with the right trustline receives a direct payment; an
 * unfunded creator (or one without a USDC trustline) receives a claimable
 * balance they can claim any time — so a tip is never lost to op_no_trust.
 */
async function buildTip(input: BuildTipInput): Promise<BuildTipResult> {
  const amount = validateAmount(input.amount);
  const fanPublicKey = validatePublicKey(input.fanPublicKey);
  const creator = await creatorService.getByHandle(input.handle);
  const refreshed = await creatorService.refreshOnchainState(creator);

  if (milestoneContractEnabled && input.asset === 'XLM' && refreshed.accountFunded) {
    const xdr = await buildRecordTipInvoke(
      fanPublicKey,
      refreshed.ownerPublicKey,
      displayToStroops(amount),
    );
    return {
      method: 'direct',
      xdr,
      asset: input.asset,
      amount,
      destination: refreshed.ownerPublicKey,
      network: refreshed.network,
      contract: true,
    };
  }

  const canReceiveDirect =
    refreshed.accountFunded && (input.asset === 'XLM' || refreshed.usdcTrustline);
  const method: TipMethod = canReceiveDirect ? 'direct' : 'claimable_balance';

  let xdr: string;
  if (method === 'direct') {
    xdr = await buildPaymentXdr({
      sourcePublicKey: fanPublicKey,
      destinationPublicKey: refreshed.ownerPublicKey,
      asset: input.asset === 'USDC' ? usdcAsset() : Asset.native(),
      amount,
      memo: { type: 'text', value: `sorak:${refreshed.handle}`.slice(0, 28) },
    });
  } else {
    xdr = await buildCreateClaimableBalanceXdr({
      sourcePublicKey: fanPublicKey,
      claimantPublicKey: refreshed.ownerPublicKey,
      asset: input.asset,
      amount,
      memo: `sorak:${refreshed.handle}`,
    });
  }

  return {
    method,
    xdr,
    asset: input.asset,
    amount,
    destination: refreshed.ownerPublicKey,
    network: refreshed.network,
  };
}

export type RecordTipInput = {
  handle: string;
  fanPublicKey: string;
  fanName?: string;
  asset: TipAsset;
  amount: string;
  message?: string;
  method: TipMethod;
  txHash?: string;
  contract?: boolean;
  signedXdr?: string;
};

export type RecordTipResult = {
  tip: Tip;
  reached: MilestoneReach[];
};

/**
 * Verify a submitted tip transaction on Horizon, persist it, drive it through
 * its state machine, and evaluate creator milestones (which may mint a badge).
 */
async function recordTip(input: RecordTipInput): Promise<RecordTipResult> {
  const amount = validateAmount(input.amount);
  const fanPublicKey = validatePublicKey(input.fanPublicKey);
  const creator = await creatorService.getByHandle(input.handle);

  const viaContract = Boolean(input.contract && input.signedXdr);
  let txHash: string;
  let onchainTier: number | undefined;

  if (viaContract) {
    const submitted = await submitRecordTipXdr(input.signedXdr as string);
    txHash = submitted.hash;
    onchainTier = submitted.tier;
  } else {
    if (!input.txHash) {
      throw new AppError('INVALID_INPUT', 'A transaction hash is required to record a tip', 400);
    }
    const onchain = await getTransaction(input.txHash).catch(() => null);
    if (!onchain || !onchain.successful) {
      throw new AppError('INVALID_INPUT', 'Transaction not found or unsuccessful on Horizon', 400);
    }
    txHash = input.txHash;
  }

  const [row] = await db
    .insert(tips)
    .values({
      creatorId: creator.id,
      fanPublicKey,
      fanName: input.fanName?.trim().slice(0, 40) || null,
      asset: input.asset,
      amount,
      message: input.message?.trim().slice(0, 280) || null,
      method: input.method,
      status: 'pending',
      stellarTxHash: txHash,
    })
    .returning();

  let tip = await transition(row, 'submitted');
  if (viaContract || input.method === 'direct') {
    tip = await transition(tip, 'confirmed', { confirmedAt: new Date() });
  } else {
    const balanceId = await getClaimableBalanceIdFromTx(txHash).catch(() => null);
    tip = await transition(tip, 'claimable', { claimableBalanceId: balanceId, confirmedAt: new Date() });
  }

  const reached = await milestoneService.evaluate(
    await creatorService.refreshOnchainState(creator),
    {
      publicKey: fanPublicKey,
      name: tip.fanName,
    },
    { onchainTier },
  );

  return { tip, reached };
}

async function transition(tip: Tip, to: TipStatus, patch: Partial<Tip> = {}): Promise<Tip> {
  assertTransition(tip.status, to);
  const [updated] = await db
    .update(tips)
    .set({ status: to, version: tip.version + 1, ...patch })
    .where(eq(tips.id, tip.id))
    .returning();
  eventBus.publish('tip.updated', {
    tipId: updated.id,
    creatorId: updated.creatorId,
    creatorHandle: '',
    version: updated.version,
    status: updated.status,
    asset: updated.asset,
    amount: updated.amount,
    fanName: updated.fanName,
    message: updated.message,
    stellarTxHash: updated.stellarTxHash,
    occurredAt: new Date(),
  });
  return updated;
}

export type BuildClaimResult = { xdr: string; balanceId: string; asset: TipAsset };

async function buildClaim(tipId: string, claimantPublicKey: string): Promise<BuildClaimResult> {
  validatePublicKey(claimantPublicKey);
  const tip = await getTip(tipId);
  if (tip.status !== 'claimable' || !tip.claimableBalanceId) {
    throw new AppError('CONFLICT', 'Tip is not in a claimable state', 409);
  }
  const creator = await creatorService.getById(tip.creatorId);
  if (creator.ownerPublicKey !== claimantPublicKey) {
    throw new AppError('FORBIDDEN', 'Only the creator can claim this tip', 403);
  }
  const state = await creatorService.refreshOnchainState(creator);
  const asset = tip.asset as TipAsset;
  const xdr = await buildClaimClaimableBalanceXdr({
    claimantPublicKey,
    balanceId: tip.claimableBalanceId,
    asset,
    addTrustline: asset === 'USDC' && !state.usdcTrustline,
  });
  return { xdr, balanceId: tip.claimableBalanceId, asset };
}

async function recordClaim(tipId: string, txHash: string): Promise<Tip> {
  const tip = await getTip(tipId);
  const onchain = await getTransaction(txHash).catch(() => null);
  if (!onchain || !onchain.successful) {
    throw new AppError('INVALID_INPUT', 'Claim transaction not found or unsuccessful', 400);
  }
  return transition(tip, 'claimed', { confirmedAt: new Date() });
}

async function getTip(tipId: string): Promise<Tip> {
  const [tip] = await db.select().from(tips).where(eq(tips.id, tipId)).limit(1);
  if (!tip) throw new AppError('NOT_FOUND', 'Tip not found', 404);
  return tip;
}

async function listForCreator(creatorId: string, limit = 50): Promise<Tip[]> {
  return db
    .select()
    .from(tips)
    .where(and(eq(tips.creatorId, creatorId), inArray(tips.status, CONFIRMED_STATES)))
    .orderBy(desc(tips.createdAt))
    .limit(limit);
}

export type LeaderboardEntry = {
  fanPublicKey: string;
  fanName: string | null;
  tipCount: number;
  totalXlm: string;
  totalUsdc: string;
  lastTipAt: Date;
};

async function leaderboard(creatorId: string, limit = 10): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select({
      fanPublicKey: tips.fanPublicKey,
      fanName: sql<string | null>`max(${tips.fanName})`,
      tipCount: sql<number>`count(*)::int`,
      totalXlm: sql<string>`coalesce(sum(case when ${tips.asset} = 'XLM' then ${tips.amount}::numeric else 0 end), 0)::text`,
      totalUsdc: sql<string>`coalesce(sum(case when ${tips.asset} = 'USDC' then ${tips.amount}::numeric else 0 end), 0)::text`,
      lastTipAt: sql<Date>`max(${tips.createdAt})`,
    })
    .from(tips)
    .where(and(eq(tips.creatorId, creatorId), inArray(tips.status, CONFIRMED_STATES)))
    .groupBy(tips.fanPublicKey)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
  return rows.map((r) => ({
    fanPublicKey: r.fanPublicKey,
    fanName: r.fanName,
    tipCount: Number(r.tipCount),
    totalXlm: r.totalXlm,
    totalUsdc: r.totalUsdc,
    lastTipAt: r.lastTipAt,
  }));
}

export type CreatorTotals = { tipCount: number; supporters: number; totalXlm: string; totalUsdc: string };

async function totalsForCreator(creatorId: string): Promise<CreatorTotals> {
  const [row] = await db
    .select({
      tipCount: sql<number>`count(*)::int`,
      supporters: sql<number>`count(distinct ${tips.fanPublicKey})::int`,
      totalXlm: sql<string>`coalesce(sum(case when ${tips.asset} = 'XLM' then ${tips.amount}::numeric else 0 end), 0)::text`,
      totalUsdc: sql<string>`coalesce(sum(case when ${tips.asset} = 'USDC' then ${tips.amount}::numeric else 0 end), 0)::text`,
    })
    .from(tips)
    .where(and(eq(tips.creatorId, creatorId), inArray(tips.status, CONFIRMED_STATES)));
  return {
    tipCount: Number(row?.tipCount ?? 0),
    supporters: Number(row?.supporters ?? 0),
    totalXlm: row?.totalXlm ?? '0',
    totalUsdc: row?.totalUsdc ?? '0',
  };
}

export const tipService = {
  TIP_TRANSITIONS,
  assertTransition,
  buildTip,
  recordTip,
  buildClaim,
  recordClaim,
  getTip,
  listForCreator,
  leaderboard,
  totalsForCreator,
  transition,
};
