import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { creators } from './creators';

export const TIP_STATUSES = [
  'pending',
  'submitted',
  'confirmed',
  'claimable',
  'claimed',
  'failed',
] as const;
export type TipStatus = (typeof TIP_STATUSES)[number];
export const tipStatusEnum = pgEnum('tip_status', TIP_STATUSES);

export const TIP_METHODS = ['direct', 'claimable_balance'] as const;
export type TipMethod = (typeof TIP_METHODS)[number];
export const tipMethodEnum = pgEnum('tip_method', TIP_METHODS);

export const tips = pgTable(
  'tips',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    fanPublicKey: text('fan_public_key').notNull(),
    fanName: text('fan_name'),
    asset: text('asset').notNull().default('XLM'),
    amount: text('amount').notNull(),
    message: text('message'),
    method: tipMethodEnum('method').notNull().default('direct'),
    status: tipStatusEnum('status').notNull().default('pending'),
    claimableBalanceId: text('claimable_balance_id'),
    stellarTxHash: text('stellar_tx_hash'),
    version: integer('version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  },
  (t) => ({
    creatorIdx: index('tips_creator_idx').on(t.creatorId),
    fanIdx: index('tips_fan_idx').on(t.fanPublicKey),
    creatorStatusCreatedIdx: index('tips_creator_status_created_idx').on(
      t.creatorId,
      t.status,
      t.createdAt,
    ),
  }),
);

export type Tip = typeof tips.$inferSelect;
export type NewTip = typeof tips.$inferInsert;
