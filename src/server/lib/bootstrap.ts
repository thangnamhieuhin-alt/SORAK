import { lt } from 'drizzle-orm';
import { env } from '@/server/config/env';
import { db } from '@/server/db/client';
import { authNonces } from '@/server/db/schema/authNonces';
import { logger } from '@/server/lib/logger';

const globalForBootstrap = globalThis as unknown as { sorakBootstrapStarted?: boolean };
const handles: { stop: () => void }[] = [];

function startNonceSweeper(): () => void {
  const timer = setInterval(() => {
    db.delete(authNonces)
      .where(lt(authNonces.expiresAt, new Date()))
      .then((r) => {
        const swept = r.rowCount ?? 0;
        if (swept) logger.info('bootstrap.swept_nonces', { swept });
      })
      .catch((err) => logger.error('bootstrap.sweeper_error', { err: String(err) }));
  }, 60_000);
  timer.unref?.();
  return () => clearInterval(timer);
}

export function ensureBootstrap(): void {
  if (globalForBootstrap.sorakBootstrapStarted) return;
  if (env.NODE_ENV === 'test') return;
  handles.push({ stop: startNonceSweeper() });
  globalForBootstrap.sorakBootstrapStarted = true;
  logger.info('bootstrap.started');
}

export function stopBootstrap(): void {
  for (const h of handles) h.stop();
  handles.length = 0;
  globalForBootstrap.sorakBootstrapStarted = false;
  logger.info('bootstrap.stopped');
}
