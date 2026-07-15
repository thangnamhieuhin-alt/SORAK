import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const creators = pgTable(
  'creators',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    handle: text('handle').notNull().unique(),
    displayName: text('display_name').notNull(),
    bio: text('bio'),
    category: text('category').notNull().default('Creator'),
    avatarColor: text('avatar_color').notNull().default('rose'),
    ownerPublicKey: text('owner_public_key').notNull(),
    goalAmount: text('goal_amount'),
    usdcTrustline: boolean('usdc_trustline').notNull().default(false),
    accountFunded: boolean('account_funded').notNull().default(false),
    network: text('network').notNull().default('public'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ownerIdx: index('creators_owner_idx').on(t.ownerPublicKey),
  }),
);

export type Creator = typeof creators.$inferSelect;
export type NewCreator = typeof creators.$inferInsert;
