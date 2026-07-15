import { listCreatorTips } from '@/server/controller/creator.controller';
import { compose } from '@/server/middleware/compose';
import { withError } from '@/server/middleware/withError';

export const dynamic = 'force-dynamic';

export const GET = compose(withError)(listCreatorTips);
