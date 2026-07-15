'use client';

import { useEffect, useRef } from 'react';
import type { BadgeMintedEvent, TipStreamEvent } from '@/ui/lib/types';

type StreamHandlers = {
  onTip?: (event: TipStreamEvent) => void;
  onBadge?: (event: BadgeMintedEvent) => void;
};

export function useTipStream(handle: string, handlers: StreamHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!handle) return;
    const source = new EventSource(`/api/creators/${handle}/stream`);

    const handleTip = (event: MessageEvent) => {
      try {
        handlersRef.current.onTip?.(JSON.parse(event.data) as TipStreamEvent);
      } catch {}
    };
    const handleBadge = (event: MessageEvent) => {
      try {
        handlersRef.current.onBadge?.(JSON.parse(event.data) as BadgeMintedEvent);
      } catch {}
    };

    source.addEventListener('tip.updated', handleTip);
    source.addEventListener('badge.minted', handleBadge);

    return () => {
      source.removeEventListener('tip.updated', handleTip);
      source.removeEventListener('badge.minted', handleBadge);
      source.close();
    };
  }, [handle]);
}
