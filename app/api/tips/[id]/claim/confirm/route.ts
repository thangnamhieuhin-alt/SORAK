import { recordClaim } from '@/server/controller/tip.controller';
import { compose } from '@/server/middleware/compose';
import { withAuth } from '@/server/middleware/withAuth';
import { withError } from '@/server/middleware/withError';

export const dynamic = 'force-dynamic';

export const POST = compose(withError, withAuth)(recordClaim);
