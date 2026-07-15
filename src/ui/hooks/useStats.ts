'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/ui/lib/api';
import type { UsageStats } from '@/ui/lib/types';

export function useStats() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setStats(await apiGet<UsageStats>('/api/stats'));
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { stats, loading, reload: load };
}
