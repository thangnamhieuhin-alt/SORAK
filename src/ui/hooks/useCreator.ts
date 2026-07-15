'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/ui/lib/api';
import type { CreatorDetail, Tip } from '@/ui/lib/types';

export function useCreator(handle: string) {
  const [detail, setDetail] = useState<CreatorDetail | null>(null);
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detailData, tipsData] = await Promise.all([
        apiGet<CreatorDetail>(`/api/creators/${handle}`),
        apiGet<{ tips: Tip[] }>(`/api/creators/${handle}/tips`),
      ]);
      setDetail(detailData);
      setTips(tipsData.tips);
      setError(null);
    } catch (err) {
      setDetail(null);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [handle]);

  useEffect(() => {
    void load();
  }, [load]);

  return { detail, tips, setTips, loading, error, reload: load };
}
