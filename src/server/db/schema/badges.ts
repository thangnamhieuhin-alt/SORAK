import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { creators } from './creators';
import { milestones } from './milestones';

export const badges = pgTable(
  'badges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    milestoneId: uuid('milestone_id')
      .notNull()
      .references(() => milestones.id, { onDelete: 'cascade' }),
    recipientPublicKey: text('recipient_public_key').notNull(),
    recipientName: text('recipient_name'),
    assetCode: text('asset_code').notNull(),
    issuerPublicKey: text('issuer_public_key').notNull(),
    claimableBalanceId: text('claimable_balance_id'),
    stellarTxHash: text('stellar_tx_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    creatorIdx: index('badges_creator_idx').on(t.creatorId),
    recipientIdx: index('badges_recipient_idx').on(t.recipientPublicKey),
  }),
);

export type Badge = typeof badges.$inferSelect;
export type NewBadge = typeof badges.$inferInsert;
