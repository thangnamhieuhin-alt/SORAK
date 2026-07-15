import type { NextRequest } from 'next/server';
import { creatorService } from '@/server/service/creator.service';
import { eventBus } from '@/server/lib/eventBus';
import { createSseResponse } from '@/server/lib/sseStream';

export const dynamic = 'force-dynamic';

/**
 * Live SSE feed for a creator page. Streams tip confirmations and badge mints
 * as they land on-chain so the leaderboard and feed update without polling.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ handle: string }> }) {
  const { handle } = await ctx.params;
  const creator = await creatorService.findByHandle(handle);
  if (!creator) {
    return new Response('Creator not found', { status: 404 });
  }
  return createSseResponse((emit, signal) => {
    eventBus.subscribe(
      'tip.updated',
      (evt) => {
        if (evt.creatorId === creator.id) emit('tip.updated', evt);
      },
      signal,
    );
    eventBus.subscribe(
      'badge.minted',
      (evt) => {
        if (evt.creatorId === creator.id) emit('badge.minted', evt);
      },
      signal,
    );
  });
}
