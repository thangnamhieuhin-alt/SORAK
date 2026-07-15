import { Keypair } from '@stellar/stellar-sdk';
import { sql } from 'drizzle-orm';
import { db } from '@/server/db/client';

export function randomPk(): string {
  return Keypair.random().publicKey();
}

export async function truncateAll(): Promise<void> {
  await db.execute(
    sql`truncate table badges, tips, milestones, creators, sessions restart identity cascade`,
  );
}

export async function seedSession(publicKey: string): Promise<void> {
  await db.execute(
    sql`insert into sessions (public_key, expires_at) values (${publicKey}, now() + interval '7 days')`,
  );
}
