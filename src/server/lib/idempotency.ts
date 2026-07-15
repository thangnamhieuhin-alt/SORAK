import { createHash, randomUUID } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { env } from '@/server/config/env';
import { db } from '@/server/db/client';
import { idempotencyKeys } from '@/server/db/schema/idempotencyKeys';
import { ok } from '@/server/lib/http';
import { logger } from '@/server/lib/logger';
import type { Middleware } from '@/server/middleware/compose';

/**
 * Idempotency-Key middleware (RFC draft "The Idempotency-Key HTTP Header Field").
 *
 * Behaviour:
 *   - If the request has an `Idempotency-Key` header, the middleware computes
 *     a `requestHash` from the body and looks up `(key, route)`. A match
 *     returns the previously-stored response verbatim.
 *   - If the header is missing, the middleware derives a key from
 *     `(merchantId, bodyHash)` and uses that instead, so accidental double-submit
 *     is also deduped.
 *   - On success, the response (status + body) is persisted with a TTL of
 *     `env.IDEMPOTENCY_TTL_SECONDS`.
 *
 * Limitations:
 *   - Only handles JSON bodies (NextRequest.json() is called once).
 *   - The route is inferred from `req.nextUrl.pathname`.
 *   - On non-2xx responses, the response is NOT cached — the caller can retry.
 */

export type IdempotentRoute = (
  req: NextRequest,
  ctx: import('@/server/middleware/compose').HandlerContext,
) => Promise<Response>;

const HASH = 'sha256';

async function sha256(s: string): Promise<string> {
  return createHash(HASH).update(s).digest('hex');
}

async function readAndRewindBody(req: NextRequest): Promise<{ raw: string; body: unknown }> {
  const cloned = req.clone();
  const text = await cloned.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  return { raw: text, body: parsed };
}

export function withIdempotency(): Middleware {
  return (handler: import('@/server/middleware/compose').RouteHandler) => async (req, ctx) => {
    const route = req.nextUrl.pathname;
    const providedKey = req.headers.get('Idempotency-Key')?.trim();
    const { raw: bodyText } = await readAndRewindBody(req);
    const requestHash = await sha256(`${ctx.publicKey ?? 'anon'}|${bodyText}`);
    const key = providedKey || `auto:${requestHash}`;

    // Look up an existing record.
    const [existing] = await db
      .select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.key, key),
          eq(idempotencyKeys.route, route),
          gt(idempotencyKeys.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (existing) {
      logger.debug('idempotency.hit', { route, key: key.slice(0, 12) });
      return ok(existing.responseBody as Record<string, unknown>, {
        status: Number(existing.responseStatus),
      });
    }

    // First time — execute the handler.
    const response = await handler(req, ctx);
    // Only cache 2xx responses; clients should be able to retry 4xx/5xx.
    if (response.status >= 200 && response.status < 300) {
      const cloned = response.clone();
      const responseBody = (await cloned.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      if (responseBody !== null) {
        const expiresAt = new Date(Date.now() + env.IDEMPOTENCY_TTL_SECONDS * 1000);
        await db
          .insert(idempotencyKeys)
          .values({
            key,
            route,
            requestHash,
            responseStatus: String(response.status),
            responseBody: responseBody as Record<string, unknown>,
            expiresAt,
          })
          .onConflictDoNothing()
          .catch((err) => {
            logger.warn('idempotency.persist_failed', { error: String(err), route });
          });
      }
    }
    return response;
  };
}

/** Used in tests to generate deterministic keys. */
export function newIdempotencyKey(): string {
  return randomUUID();
}
