import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { creators } from './creators';

export const MILESTONE_STATUSES = ['locked', 'reached', 'badge_minted'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];
export const milestoneStatusEnum = pgEnum('milestone_status', MILESTONE_STATUSES);

export const milestones = pgTable(
  'milestones',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    tier: integer('tier').notNull(),
    title: text('title').notNull(),
    thresholdAmount: text('threshold_amount').notNull(),
    badgeAssetCode: text('badge_asset_code').notNull(),
    status: milestoneStatusEnum('status').notNull().default('locked'),
    reachedAt: timestamp('reached_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    creatorTierIdx: index('milestones_creator_tier_idx').on(t.creatorId, t.tier),
  }),
);

export type Milestone = typeof milestones.$inferSelect;
export type NewMilestone = typeof milestones.$inferInsert;
