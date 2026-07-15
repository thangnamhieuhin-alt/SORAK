import { StrKey } from '@stellar/stellar-sdk';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { env } from '@/server/config/env';
import { AppError, created, ok } from '@/server/lib/http';
import type { HandlerContext } from '@/server/middleware/compose';
import { creatorService } from '@/server/service/creator.service';
import { milestoneService } from '@/server/service/milestone.service';
import { tipService } from '@/server/service/tip.service';
import { buildSponsoredUsdcTrustlineXdr } from '@/server/stellar/assets';
import { buildTipUri } from '@/server/stellar/sep7';

const createSchema = z.object({
  handle: z.string().min(3).max(30),
  displayName: z.string().min(2).max(60),
  bio: z.string().max(280).optional(),
  category: z.string().max(40).optional(),
  goalAmount: z.string().optional(),
});

export async function createCreator(req: NextRequest, ctx: HandlerContext) {
  if (!ctx.publicKey) throw new AppError('UNAUTHORIZED', 'Connect a wallet first', 401);
  const body = createSchema.parse(await req.json());
  const creator = await creatorService.create({
    ...body,
    ownerPublicKey: ctx.publicKey,
    badgePrefix: env.BADGE_ASSET_PREFIX,
  });
  return created(creator);
}

export async function listCreators() {
  const list = await creatorService.list();
  return ok({ creators: list });
}

export async function listMyCreators(_req: NextRequest, ctx: HandlerContext) {
  if (!ctx.publicKey) throw new AppError('UNAUTHORIZED', 'Connect a wallet first', 401);
  const list = await creatorService.listByOwner(ctx.publicKey);
  return ok({ creators: list });
}

export async function getCreator(_req: NextRequest, ctx: HandlerContext) {
  const params = ctx.params ? await ctx.params : {};
  const handle = String(params.handle ?? '');
  const creator = await creatorService.getByHandle(handle);
  const refreshed = await creatorService.refreshOnchainState(creator);
  const [milestones, totals, leaderboard, badges] = await Promise.all([
    milestoneService.listFor(refreshed.id),
    tipService.totalsForCreator(refreshed.id),
    tipService.leaderboard(refreshed.id),
    milestoneService.badgesFor(refreshed.id),
  ]);
  const tipUri = buildTipUri({
    destination: refreshed.ownerPublicKey,
    asset: 'XLM',
    message: `Tip ${refreshed.displayName}`,
  });
  return ok({ creator: refreshed, milestones, totals, leaderboard, badges, tipUri });
}

export async function listCreatorTips(_req: NextRequest, ctx: HandlerContext) {
  const params = ctx.params ? await ctx.params : {};
  const handle = String(params.handle ?? '');
  const creator = await creatorService.getByHandle(handle);
  const tips = await tipService.listForCreator(creator.id);
  return ok({ tips });
}

export async function buildSponsoredTrustline(_req: NextRequest, ctx: HandlerContext) {
  if (!ctx.publicKey) throw new AppError('UNAUTHORIZED', 'Connect a wallet first', 401);
  if (!StrKey.isValidEd25519PublicKey(ctx.publicKey)) {
    throw new AppError('INVALID_PUBLIC_KEY', 'Invalid public key', 400);
  }
  const xdr = await buildSponsoredUsdcTrustlineXdr({ creatorPublicKey: ctx.publicKey });
  return ok({ xdr });
}
