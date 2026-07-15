/* eslint-disable no-console */
/**
 * End-to-end smoke test for the Universal Merchant Payment Hub backend.
 *
 * Run against a live dev server (`npm run dev` in another terminal):
 *
 *   # 1. Make sure the dev server is up and the schema is migrated.
 *   npm run db:migrate
 *   npm run dev
 *
 *   # 2. In another terminal, run the smoke test.
 *   npx tsx scripts/smoke.ts
 *
 *   # Or against a different host:
 *   BASE=http://localhost:4000 npx tsx scripts/smoke.ts
 *
 * The script:
 *   1. Generates a fresh test keypair (testnet-friendly; not funded).
 *   2. Walks the auth challenge/verify flow and saves the session cookie.
 *   3. Hits every wallet/invoice/offramp/receive/convert route.
 *   4. Asserts the response shapes and prints a summary table.
 *
 * The script is safe to re-run: every fresh keypair creates a new merchant
 * row. It is read-only with respect to the chain (no Horizon / anchor
 * calls; the merchant's wallet is not funded so balance stays at 0).
 */

import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { env } from '../src/server/config/env';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const STELLAR_PASSPHRASE = env.STELLAR_NETWORK_PASSPHRASE;

type Result = {
  step: string;
  status: 'OK' | 'FAIL';
  detail?: string;
  httpStatus?: number;
};
const results: Result[] = [];

class CookieJar {
  private cookies = new Map<string, string>();
  setFromSetCookie(setCookie: string | null) {
    if (!setCookie) return;
    for (const piece of setCookie.split(/, (?=[^;]+=)/)) {
      const first = piece.split(';')[0]?.trim();
      if (!first) continue;
      const eq = first.indexOf('=');
      if (eq < 0) continue;
      this.cookies.set(first.slice(0, eq), first.slice(eq + 1));
    }
  }
  header(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
  get(name: string): string | undefined {
    return this.cookies.get(name);
  }
}

async function call(
  jar: CookieJar,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown; text: string }> {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (body) headers['Content-Type'] = 'application/json';
  if (jar.get('stellar_session')) headers.Cookie = jar.header();
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  // Capture Set-Cookie for the session.
  const setCookie = res.headers.get('set-cookie');
  jar.setFromSetCookie(setCookie);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* leave json null */
  }
  return { status: res.status, json, text };
}

function record(step: string, status: 'OK' | 'FAIL', detail?: string, httpStatus?: number) {
  const result = { step, status, detail, httpStatus };
  results.push(result);
  const tag = status === 'OK' ? '✔' : '✗';
  const color = status === 'OK' ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';
  const http = httpStatus ? ` (${httpStatus})` : '';
  console.log(`${color}${tag}${reset} ${step}${http}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log(`\n=== Universal Merchant Payment Hub — Smoke Test ===`);
  console.log(`Base URL: ${BASE}`);
  console.log(`Stellar network: ${env.STELLAR_NETWORK}\n`);

  // 0. Health & mock-anchor.
  const health = await call(new CookieJar(), 'GET', '/api/health');
  record('GET /api/health', health.status === 200 ? 'OK' : 'FAIL', undefined, health.status);

  const toml = await call(new CookieJar(), 'GET', '/api/mock-anchor/stellar.toml');
  record(
    'GET /api/mock-anchor/stellar.toml',
    toml.status === 200 && toml.text.includes('TRANSFER_SERVER_SEP0024') ? 'OK' : 'FAIL',
    undefined,
    toml.status,
  );

  const sep24 = await call(new CookieJar(), 'GET', '/api/mock-anchor/sep24/info');
  record(
    'GET /api/mock-anchor/sep24/info',
    sep24.status === 200 ? 'OK' : 'FAIL',
    undefined,
    sep24.status,
  );

  const sep38 = await call(new CookieJar(), 'GET', '/api/mock-anchor/sep38/info');
  record(
    'GET /api/mock-anchor/sep38/info',
    sep38.status === 200 ? 'OK' : 'FAIL',
    undefined,
    sep38.status,
  );

  // 1. Auth — generate a test keypair and walk the challenge flow.
  const kp = Keypair.random();
  const publicKey = kp.publicKey();
  console.log(`\nGenerated test keypair: ${publicKey}`);

  const jar = new CookieJar();
  const challenge = await call(jar, 'POST', '/api/auth/challenge', { publicKey });
  const challengeBody = (challenge.json as { data?: { txXdr?: string } })?.data;
  const txXdr = challengeBody?.txXdr;
  if (challenge.status !== 200 || !txXdr) {
    record('POST /api/auth/challenge', 'FAIL', 'no txXdr returned', challenge.status);
    return finish();
  }
  record('POST /api/auth/challenge', 'OK', undefined, challenge.status);

  // Sign the challenge transaction locally.
  const tx = TransactionBuilder.fromXDR(txXdr, STELLAR_PASSPHRASE);
  tx.sign(kp);
  const signedXdr = tx.toXDR();

  const verify = await call(jar, 'POST', '/api/auth/verify', {
    publicKey,
    signedNonce: signedXdr,
  });
  if (verify.status !== 200 || !jar.get('stellar_session')) {
    record('POST /api/auth/verify', 'FAIL', 'no session cookie', verify.status);
    return finish();
  }
  record('POST /api/auth/verify', 'OK', 'session cookie set', verify.status);

  // 2. Merchant endpoints.
  const me = await call(jar, 'GET', '/api/auth/me');
  const meOk = (me.json as { data?: { publicKey?: string } })?.data?.publicKey === publicKey;
  record('GET /api/auth/me', meOk ? 'OK' : 'FAIL', undefined, me.status);

  const merchant = await call(jar, 'GET', '/api/merchants');
  record('GET /api/merchants', merchant.status === 200 ? 'OK' : 'FAIL', undefined, merchant.status);

  const stats = await call(jar, 'GET', '/api/merchants/me/stats');
  const statsBody = (
    stats.json as { data?: { wallet?: { usdcTrustline?: boolean; accountExists?: boolean } } }
  )?.data;
  record(
    'GET /api/merchants/me/stats',
    stats.status === 200 ? 'OK' : 'FAIL',
    statsBody?.wallet?.accountExists
      ? 'wallet funded on testnet'
      : 'wallet not funded (expected for random test key)',
    stats.status,
  );

  // 3. Invoice flow.
  const created = await call(jar, 'POST', '/api/invoices', {
    amountMinor: '2000000', // $2.00
    currency: 'USD',
    description: `Smoke test invoice ${Date.now()}`,
  });
  const createdBody = (
    created.json as {
      data?: {
        invoice?: { id?: string; status?: string };
        signedId?: string;
        checkoutUrl?: string;
      };
    }
  )?.data;
  if (created.status !== 201 || !createdBody?.signedId) {
    record('POST /api/invoices', 'FAIL', 'no signedId', created.status);
    return finish();
  }
  record(
    'POST /api/invoices',
    'OK',
    `id=${createdBody.invoice?.id?.slice(0, 8)} status=${createdBody.invoice?.status}`,
    created.status,
  );

  const list = await call(jar, 'GET', '/api/invoices?limit=5');
  record('GET /api/invoices', list.status === 200 ? 'OK' : 'FAIL', undefined, list.status);

  const publicBySigned = await call(
    new CookieJar(),
    'GET',
    `/api/invoices/by-signed/${createdBody.signedId}`,
  );
  record(
    'GET /api/invoices/by-signed/:id',
    publicBySigned.status === 200 ? 'OK' : 'FAIL',
    undefined,
    publicBySigned.status,
  );

  const status = await call(
    new CookieJar(),
    'GET',
    `/api/invoices/by-signed/${createdBody.signedId}/status`,
  );
  record(
    'GET /api/invoices/by-signed/:id/status',
    status.status === 200 ? 'OK' : 'FAIL',
    undefined,
    status.status,
  );

  // 4. Receive v2.
  const receive = await call(jar, 'POST', '/api/wallet/receive/request', {
    amount: '1000000',
    memo: { type: 'text', value: 'table 4' },
  });
  const receiveBody = (receive.json as { data?: { uri?: string } })?.data;
  record(
    'POST /api/wallet/receive/request',
    receive.status === 200 && receiveBody?.uri?.startsWith('web+stellar:pay?') ? 'OK' : 'FAIL',
    receiveBody?.uri?.slice(0, 60),
    receive.status,
  );

  // 5. Send (build only — submit requires Freighter signature, skip).
  const sendBuild = await call(jar, 'POST', '/api/wallet/send/build', {
    destination: publicKey, // sending to self is rejected, so use a different test key
    amount: '100000',
  });
  const sendBuildBody = (sendBuild.json as { data?: unknown; error?: { code?: string } })?.error;
  // Expect 400 because destination == source. This proves the endpoint validates.
  record(
    'POST /api/wallet/send/build (rejects self-send)',
    sendBuild.status === 400 && sendBuildBody?.code === 'INVALID_INPUT' ? 'OK' : 'FAIL',
    sendBuildBody?.code,
    sendBuild.status,
  );

  // 6. Convert (quote only — build requires funded account).
  const convertQuote = await call(
    jar,
    'GET',
    '/api/wallet/convert/quote?destinationAssetCode=XLM&amount=1000000',
  );
  // Expect either 200 (path exists) or 400 (no path on testnet). Both prove the route is live.
  record(
    'GET /api/wallet/convert/quote',
    convertQuote.status === 200 || convertQuote.status === 400 ? 'OK' : 'FAIL',
    `status ${convertQuote.status}`,
    convertQuote.status,
  );

  // 7. Off-ramp cash-out.
  const quote = await call(jar, 'POST', '/api/offramp/quotes', {
    sellAsset: `stellar:${env.USDC_ASSET_CODE}:${env.USDC_ASSET_ISSUER_TESTNET}`,
    buyAsset: 'iso4217:PHP',
    sellAmount: '500000', // $0.50
    buyDeliveryMethod: 'cash_pickup',
    countryCode: 'PH',
  });
  const quoteBody = (quote.json as { data?: { id?: string; buyAmount?: string } })?.data;
  record(
    'POST /api/offramp/quotes',
    quote.status === 201 && quoteBody?.id ? 'OK' : 'FAIL',
    quoteBody
      ? `quote id ${quoteBody.id?.slice(0, 8)} buyAmount ${quoteBody.buyAmount}`
      : undefined,
    quote.status,
  );

  if (!quoteBody?.id) return finish();
  const withdrawal = await call(jar, 'POST', '/api/offramp/withdrawals', {
    quoteId: quoteBody.id,
    payoutMethod: 'cash_pickup',
    payoutMeta: {
      v: 1,
      kind: 'cash_pickup',
      data: { pickupLocation: 'Manila', recipientName: 'Smoke Test' },
    },
  });
  const withdrawalBody = (withdrawal.json as { data?: { id?: string; status?: string } })?.data;
  record(
    'POST /api/offramp/withdrawals',
    withdrawal.status === 201 && withdrawalBody?.id ? 'OK' : 'FAIL',
    withdrawalBody?.id
      ? `id ${withdrawalBody.id.slice(0, 8)} status ${withdrawalBody.status}`
      : undefined,
    withdrawal.status,
  );

  if (!withdrawalBody?.id) return finish();
  const start = await call(jar, 'PATCH', '/api/offramp/withdrawals', {
    withdrawalId: withdrawalBody.id,
  });
  record(
    'PATCH /api/offramp/withdrawals (start)',
    start.status === 200 ? 'OK' : 'FAIL',
    undefined,
    start.status,
  );

  // 8. Poll until status === 'completed' or timeout (10s).
  const startTs = Date.now();
  let finalStatus: string | undefined;
  while (Date.now() - startTs < 12_000) {
    const poll = await call(jar, 'GET', `/api/offramp/withdrawals/${withdrawalBody.id}`);
    const pollBody = (poll.json as { data?: { status?: string } })?.data;
    if (pollBody?.status) finalStatus = pollBody.status;
    if (finalStatus === 'completed' || finalStatus === 'failed' || finalStatus === 'refunded')
      break;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  record(
    'Poll /api/offramp/withdrawals/:id',
    finalStatus === 'completed' ? 'OK' : 'FAIL',
    `final status: ${finalStatus}`,
  );

  finish();
}

function finish() {
  console.log('\n=== Summary ===');
  const ok = results.filter((r) => r.status === 'OK').length;
  const fail = results.length - ok;
  console.log(`OK: ${ok}  FAIL: ${fail}  TOTAL: ${results.length}`);
  if (fail > 0) {
    process.exitCode = 1;
    console.log('\nFailed steps:');
    for (const r of results.filter((x) => x.status === 'FAIL')) {
      console.log(` - ${r.step}${r.detail ? ` (${r.detail})` : ''}`);
    }
  } else {
    console.log('\nAll checks passed. ✅');
  }
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
