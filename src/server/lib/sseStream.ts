import { env } from '@/server/config/env';

/**
 * SSE writer for Next.js route handlers. Returns a `Response` whose body is a
 * `ReadableStream` that emits the standard SSE framing.
 *
 * Lifecycle:
 *   - On open, sends `:connected\n\n` to flush headers immediately, then a
 *     `retry: 5000` hint so EventSource clients auto-reconnect after 5s.
 *   - Every `heartbeatMs` it emits `:ping\n\n` so proxies don't time the
 *     connection out.
 *   - The supplied `onSignal` callback is wired to the request's abort signal
 *     so the stream cleans up on client disconnect.
 *   - The stream is also passed an `AbortController` so the consumer can
 *     call `controller.abort()` to close it server-side (e.g. when the
 *     underlying entity reaches a terminal state).
 *
 * Usage:
 *   return createSseResponse((emit, signal) => {
 *     const unsubscribe = eventBus.subscribe('invoice.updated', (evt) => {
 *       if (evt.signedId === signedId) emit('invoice.updated', evt);
 *     }, signal);
 *     signal.addEventListener('abort', unsubscribe, { once: true });
 *   });
 */

export type SseEmit = (event: string, data: unknown) => void;
export type SseHandler = (emit: SseEmit, signal: AbortSignal) => void | Promise<void>;

const DEFAULT_RETRY_MS = 5_000;

export function createSseResponse(handler: SseHandler): Response {
  const controller = new AbortController();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      // 1. Initial flush so clients receive headers immediately.
      streamController.enqueue(encoder.encode(`:${Date.now()}\n\n`));
      streamController.enqueue(encoder.encode(`retry: ${DEFAULT_RETRY_MS}\n\n`));

      // 2. Heartbeat loop.
      const heartbeat = setInterval(() => {
        if (controller.signal.aborted) return;
        try {
          streamController.enqueue(encoder.encode(`:ping\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, env.SSE_HEARTBEAT_MS);

      // 3. Cleanup on any abort.
      const cleanup = () => {
        clearInterval(heartbeat);
        try {
          streamController.close();
        } catch {
          /* already closed */
        }
      };
      controller.signal.addEventListener('abort', cleanup, { once: true });

      // 4. Emit helper handed to the caller.
      const emit: SseEmit = (event, data) => {
        if (controller.signal.aborted) return;
        const payload = typeof data === 'string' ? data : safeStringify(data);
        const frame = `event: ${event}\ndata: ${payload}\n\n`;
        try {
          streamController.enqueue(encoder.encode(frame));
        } catch {
          controller.abort();
        }
      };

      // 5. Hand off to the route's body.
      try {
        await handler(emit, controller.signal);
      } finally {
        controller.abort();
      }
    },
    cancel() {
      controller.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, v) => {
      if (v instanceof Date) return v.toISOString();
      return v;
    });
  } catch {
    return '{"error":"unserializable"}';
  }
}
