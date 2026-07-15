import { recordTip } from '@/server/controller/tip.controller';
import { compose } from '@/server/middleware/compose';
import { withError } from '@/server/middleware/withError';
import { withRateLimit } from '@/server/middleware/withRateLimit';

export const dynamic = 'force-dynamic';

export const POST = compose(withError, withRateLimit)(recordTip);
