/**
 * Next.js instrumentation hook — runs once when the server process starts.
 * Kicks off background jobs (expiry sweeper, withdrawal poller, EVM watcher).
 */
export async function register() {
  if (process.env.ENABLE_BACKGROUND_JOBS !== 'true') return;
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureBootstrap } = await import('@/server/lib/bootstrap');
    ensureBootstrap();
  }
}
