import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { type Badge, badges } from '@/server/db/schema/badges';
import { type Creator } from '@/server/db/schema/creators';
import { type Milestone, milestones } from '@/server/db/schema/milestones';
import { tips } from '@/server/db/schema/tips';
import { eventBus } from '@/server/lib/eventBus';
import { logger } from '@/server/lib/logger';
import { mintBadgeToFan } from '@/server/stellar/assets';
import { env } from '@/server/config/env';

const CONFIRMED_STATES = ['confirmed', 'claimable', 'claimed'] as const;

export type MilestoneReach = {
  milestone: Milestone;
  badge: Badge | null;
  minted: boolean;
};

async function confirmedTipCount(creatorId: string): Promise<number> {
  const rows = await db
    .select({ id: tips.id })
    .from(tips)
    .where(and(eq(tips.creatorId, creatorId), inArray(tips.status, [...CONFIRMED_STATES])));
  return rows.length;
}

export const milestoneService = {
  async listFor(creatorId: string): Promise<Milestone[]> {
    return db
      .select()
      .from(milestones)
      .where(eq(milestones.creatorId, creatorId))
      .orderBy(asc(milestones.tier));
  },

  async badgesFor(creatorId: string): Promise<Badge[]> {
    return db.select().from(badges).where(eq(badges.creatorId, creatorId));
  },

  /**
   * Called after a tip confirms. Marks every newly-reached milestone and mints
   * a fan-badge asset on-chain to the fan whose tip crossed the threshold.
   * Returns the milestones reached this call so the caller can surface them.
   */
  async evaluate(
    creator: Creator,
    fan: { publicKey: string; name: string | null },
    onchain: { onchainTier?: number } = {},
  ): Promise<MilestoneReach[]> {
    const count = await confirmedTipCount(creator.id);
    const supporterTierOnChain = onchain.onchainTier ?? 0;
    if (supporterTierOnChain > 0) {
      logger.info('milestone.onchain_tier_crossed', {
        creatorId: creator.id,
        supporter: fan.publicKey,
        tier: supporterTierOnChain,
      });
    }
    const pending = await db
      .select()
      .from(milestones)
      .where(and(eq(milestones.creatorId, creator.id), eq(milestones.status, 'locked')))
      .orderBy(asc(milestones.tier));

    const reached: MilestoneReach[] = [];
    for (const m of pending) {
      const reachedByCount = count >= Number(m.thresholdAmount);
      const reachedOnChain = supporterTierOnChain >= m.tier;
      if (!reachedByCount && !reachedOnChain) continue;
      const [marked] = await db
        .update(milestones)
        .set({ status: 'reached', reachedAt: new Date() })
        .where(eq(milestones.id, m.id))
        .returning();
      const badge = await this.mintBadge(creator, marked, fan);
      reached.push({ milestone: marked, badge, minted: badge !== null });
    }
    return reached;
  },

  async mintBadge(
    creator: Creator,
    milestone: Milestone,
    fan: { publicKey: string; name: string | null },
  ): Promise<Badge | null> {
    if (!env.PLATFORM_ISSUER_SECRET) {
      logger.warn('milestone.badge_skipped_no_issuer', { milestoneId: milestone.id });
      return null;
    }
    try {
      const mint = await mintBadgeToFan({
        recipientPublicKey: fan.publicKey,
        assetCode: milestone.badgeAssetCode,
        creatorHandle: creator.handle,
      });
      const [badge] = await db
        .insert(badges)
        .values({
          creatorId: creator.id,
          milestoneId: milestone.id,
          recipientPublicKey: fan.publicKey,
          recipientName: fan.name,
          assetCode: milestone.badgeAssetCode,
          issuerPublicKey: mint.issuerPublicKey,
          claimableBalanceId: mint.balanceId,
          stellarTxHash: mint.txHash,
        })
        .returning();
      await db
        .update(milestones)
        .set({ status: 'badge_minted' })
        .where(eq(milestones.id, milestone.id));
      eventBus.publish('badge.minted', {
        badgeId: badge.id,
        creatorId: creator.id,
        creatorHandle: creator.handle,
        assetCode: badge.assetCode,
        recipientName: badge.recipientName,
        stellarTxHash: badge.stellarTxHash,
        occurredAt: new Date(),
      });
      return badge;
    } catch (err) {
      logger.error('milestone.mint_failed', { milestoneId: milestone.id, err: String(err) });
      return null;
    }
  },
};
