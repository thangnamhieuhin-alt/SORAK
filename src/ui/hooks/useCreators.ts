'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/ui/lib/api';
import type { Creator } from '@/ui/lib/types';

export function useCreators() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<{ creators: Creator[] }>('/api/creators');
      setCreators(data.creators);
    } catch {
      setCreators([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { creators, loading, reload: load };
}
