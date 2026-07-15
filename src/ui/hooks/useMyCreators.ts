'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/ui/lib/api';
import type { Creator } from '@/ui/lib/types';

export function useMyCreators(enabled: boolean) {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiGet<{ creators: Creator[] }>('/api/me/creators');
      setCreators(data.creators);
    } catch {
      setCreators([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  return { creators, loading, reload: load };
}
