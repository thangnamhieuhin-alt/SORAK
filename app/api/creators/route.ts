import { createCreator, listCreators } from '@/server/controller/creator.controller';
import { compose } from '@/server/middleware/compose';
import { withAuth } from '@/server/middleware/withAuth';
import { withError } from '@/server/middleware/withError';
import { withRateLimit } from '@/server/middleware/withRateLimit';

export const dynamic = 'force-dynamic';

export const GET = compose(withError)(listCreators);
export const POST = compose(withError, withRateLimit, withAuth)(createCreator);
