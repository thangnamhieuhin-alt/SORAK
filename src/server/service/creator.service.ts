import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { type Creator, creators } from '@/server/db/schema/creators';
import { milestones } from '@/server/db/schema/milestones';
import { AppError } from '@/server/lib/http';
import { loadAccountState } from '@/server/stellar/account';

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;
const AVATAR_COLORS = ['rose', 'amber', 'violet', 'emerald', 'sky', 'fuchsia'] as const;

const DEFAULT_MILESTONES = [
  { tier: 1, title: 'First supporter', threshold: 1, code: '1' },
  { tier: 2, title: 'Three supporters', threshold: 3, code: '2' },
  { tier: 3, title: 'Five supporters', threshold: 5, code: '3' },
] as const;

export type CreateCreatorInput = {
  handle: string;
  displayName: string;
  bio?: string;
  category?: string;
  ownerPublicKey: string;
  goalAmount?: string;
  badgePrefix: string;
};

function normalizeHandle(raw: string): string {
  const h = raw.trim().toLowerCase();
  if (!HANDLE_RE.test(h)) {
    throw new AppError('INVALID_INPUT', 'Handle must be 3-30 lowercase letters, numbers or hyphens', 400);
  }
  return h;
}

export const creatorService = {
  async create(input: CreateCreatorInput): Promise<Creator> {
    const handle = normalizeHandle(input.handle);
    const existing = await db.select().from(creators).where(eq(creators.handle, handle)).limit(1);
    if (existing.length > 0) {
      throw new AppError('ALREADY_EXISTS', 'That handle is already taken', 409);
    }
    const color = AVATAR_COLORS[handle.length % AVATAR_COLORS.length];
    const [creator] = await db
      .insert(creators)
      .values({
        handle,
        displayName: input.displayName.trim().slice(0, 60),
        bio: input.bio?.trim().slice(0, 280),
        category: input.category?.trim().slice(0, 40) || 'Creator',
        avatarColor: color,
        ownerPublicKey: input.ownerPublicKey,
        goalAmount: input.goalAmount,
      })
      .returning();
    await db.insert(milestones).values(
      DEFAULT_MILESTONES.map((m) => ({
        creatorId: creator.id,
        tier: m.tier,
        title: m.title,
        thresholdAmount: String(m.threshold),
        badgeAssetCode: `${input.badgePrefix}${m.code}`,
      })),
    );
    return creator;
  },

  async getByHandle(handle: string): Promise<Creator> {
    const [creator] = await db
      .select()
      .from(creators)
      .where(eq(creators.handle, handle.toLowerCase()))
      .limit(1);
    if (!creator) throw new AppError('NOT_FOUND', 'Creator not found', 404);
    return creator;
  },

  async getById(id: string): Promise<Creator> {
    const [creator] = await db.select().from(creators).where(eq(creators.id, id)).limit(1);
    if (!creator) throw new AppError('NOT_FOUND', 'Creator not found', 404);
    return creator;
  },

  async findByHandle(handle: string): Promise<Creator | null> {
    const [creator] = await db
      .select()
      .from(creators)
      .where(eq(creators.handle, handle.toLowerCase()))
      .limit(1);
    return creator ?? null;
  },

  async listByOwner(ownerPublicKey: string): Promise<Creator[]> {
    return db
      .select()
      .from(creators)
      .where(eq(creators.ownerPublicKey, ownerPublicKey))
      .orderBy(desc(creators.createdAt));
  },

  async list(limit = 24): Promise<Creator[]> {
    return db.select().from(creators).orderBy(desc(creators.createdAt)).limit(limit);
  },

  async milestonesFor(creatorId: string) {
    return db
      .select()
      .from(milestones)
      .where(eq(milestones.creatorId, creatorId))
      .orderBy(asc(milestones.tier));
  },

  /** Refresh cached on-chain funding + trustline flags from Horizon. Best-effort. */
  async refreshOnchainState(creator: Creator): Promise<Creator> {
    const state = await loadAccountState(creator.ownerPublicKey).catch(() => null);
    if (!state) return creator;
    if (state.exists === creator.accountFunded && state.usdcTrustline === creator.usdcTrustline) {
      return creator;
    }
    const [updated] = await db
      .update(creators)
      .set({ accountFunded: state.exists, usdcTrustline: state.usdcTrustline, updatedAt: new Date() })
      .where(eq(creators.id, creator.id))
      .returning();
    return updated;
  },
};
