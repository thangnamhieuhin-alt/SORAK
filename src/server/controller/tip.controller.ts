import { StrKey } from '@stellar/stellar-sdk';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { AppError, ok } from '@/server/lib/http';
import type { HandlerContext } from '@/server/middleware/compose';
import { tipService } from '@/server/service/tip.service';

const publicKeySchema = z
  .string()
  .refine((v) => StrKey.isValidEd25519PublicKey(v), { message: 'INVALID_PUBLIC_KEY' });

const assetSchema = z.enum(['XLM', 'USDC']);

const buildSchema = z.object({
  handle: z.string().min(3).max(30),
  fanPublicKey: publicKeySchema,
  asset: assetSchema,
  amount: z.string().min(1),
  message: z.string().max(280).optional(),
});

const recordSchema = z
  .object({
    handle: z.string().min(3).max(30),
    fanPublicKey: publicKeySchema,
    fanName: z.string().max(40).optional(),
    asset: assetSchema,
    amount: z.string().min(1),
    message: z.string().max(280).optional(),
    method: z.enum(['direct', 'claimable_balance']),
    txHash: z.string().length(64).optional(),
    contract: z.boolean().optional(),
    signedXdr: z.string().min(1).optional(),
  })
  .refine((v) => (v.contract && v.signedXdr) || v.txHash, {
    message: 'Either a signed contract transaction or a txHash is required',
  });

export async function buildTip(req: NextRequest) {
  const body = buildSchema.parse(await req.json());
  const result = await tipService.buildTip(body);
  return ok(result);
}

export async function recordTip(req: NextRequest) {
  const body = recordSchema.parse(await req.json());
  const { tip, reached } = await tipService.recordTip(body);
  return ok({
    tip,
    badges: reached.filter((r) => r.badge).map((r) => r.badge),
    reachedMilestones: reached.map((r) => r.milestone),
  });
}

const claimBuildSchema = z.object({ claimantPublicKey: publicKeySchema });
const claimRecordSchema = z.object({ txHash: z.string().length(64) });

export async function buildClaim(req: NextRequest, ctx: HandlerContext) {
  const params = ctx.params ? await ctx.params : {};
  const tipId = String(params.id ?? '');
  const { claimantPublicKey } = claimBuildSchema.parse(await req.json());
  if (ctx.publicKey && ctx.publicKey !== claimantPublicKey) {
    throw new AppError('FORBIDDEN', 'Claimant must match the connected wallet', 403);
  }
  const result = await tipService.buildClaim(tipId, claimantPublicKey);
  return ok(result);
}

export async function recordClaim(req: NextRequest, ctx: HandlerContext) {
  const params = ctx.params ? await ctx.params : {};
  const tipId = String(params.id ?? '');
  const { txHash } = claimRecordSchema.parse(await req.json());
  const tip = await tipService.recordClaim(tipId, txHash);
  return ok({ tip });
}
