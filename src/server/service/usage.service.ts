import { sql } from 'drizzle-orm';
import { db } from '@/server/db/client';

export interface UsageStats {
  uniqueWallets: number;
  logins: number;
  creators: number;
  totalTips: number;
  tipSupporters: number;
  badgesMinted: number;
  generatedAt: string;
}

async function rows(query: ReturnType<typeof sql>): Promise<Record<string, unknown>[]> {
  const res = (await db.execute(query)) as unknown as { rows: Record<string, unknown>[] };
  return res.rows ?? [];
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v ?? 0);
}

/**
 * Public read-only platform metrics. Every number is derived from real rows:
 * connected wallets (sessions), creator pages, on-chain tips, and fan badges
 * actually minted on Stellar.
 */
export async function getUsageStats(): Promise<UsageStats> {
  const [wallets] = await rows(sql`select count(distinct public_key)::int c from sessions`);
  const [logins] = await rows(sql`select count(*)::int c from sessions`);
  const [creatorCount] = await rows(sql`select count(*)::int c from creators`);
  const [tipCount] = await rows(
    sql`select count(*)::int c from tips where status in ('confirmed','claimable','claimed')`,
  );
  const [supporters] = await rows(
    sql`select count(distinct fan_public_key)::int c from tips where status in ('confirmed','claimable','claimed')`,
  );
  const [badgeCount] = await rows(sql`select count(*)::int c from badges`);

  return {
    uniqueWallets: num(wallets?.c),
    logins: num(logins?.c),
    creators: num(creatorCount?.c),
    totalTips: num(tipCount?.c),
    tipSupporters: num(supporters?.c),
    badgesMinted: num(badgeCount?.c),
    generatedAt: new Date().toISOString(),
  };
}
