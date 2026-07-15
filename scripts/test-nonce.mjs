import { db } from '../src/server/db/client';
import { authNonces } from '../src/server/db/schema/authNonces';

try {
  const nonce = 'TEST_' + Date.now();
  const r = await db
    .insert(authNonces)
    .values({
      nonce,
      publicKey: 'GBR5IM7U2YQ2PUO2UJIGSKI54CWAD6N6QC2CHQHJC4TNFRNOHVJE7NKD',
      expiresAt: new Date(Date.now() + 300000),
    })
    .returning();
  console.log('OK:', r);
} catch (e) {
  console.error('REAL ERROR:');
  console.error('  code:', e.code);
  console.error('  message:', e.message);
  console.error('  detail:', e.detail);
  console.error('  hint:', e.hint);
  console.error('  table:', e.table);
  console.error('  column:', e.column);
  console.error('  full:', JSON.stringify(e, null, 2));
}
process.exit(0);
