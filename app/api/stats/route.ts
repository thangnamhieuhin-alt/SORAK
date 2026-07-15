import type { NextRequest } from 'next/server';
import { ok } from '@/server/lib/http';
import { compose } from '@/server/middleware/compose';
import { withError } from '@/server/middleware/withError';
import { getUsageStats } from '@/server/service/usage.service';

export const dynamic = 'force-dynamic';

export const GET = compose(withError)(async (_req: NextRequest) => ok(await getUsageStats()));
