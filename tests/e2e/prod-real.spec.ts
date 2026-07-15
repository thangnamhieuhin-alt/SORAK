import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { type BrowserContext, chromium, expect, type Page, test } from '@playwright/test';
import {
  approveOnce,
  cleanup,
  launchWithFreighter,
  onboardFreighter,
} from '../../../../../shared/freighter/freighter-fixture';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://sorak-amber.vercel.app';
const DEPLOYER_HEAD = 'GBL5';
const DEPLOYER_TAIL = 'IE47';
const TIP_HANDLE = 'ploydraws';
const TIP_RETRIES = 4;

const SHOTS = path.resolve(__dirname, '../../../screen-shot');
mkdirSync(SHOTS, { recursive: true });

const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(SHOTS, name), type: 'jpeg', quality: 85 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const captured = new Set<string>();

test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let userDataDir: string;
let extensionId: string;

async function isOnboarded(): Promise<boolean> {
  const id = extensionId;
  const probe = await context.newPage();
  try {
    await probe.goto(`chrome-extension://${id}/index.html#/`, { waitUntil: 'domcontentloaded' });
    await probe.waitForTimeout(2500);
    const welcome = await probe
      .getByRole('button', { name: /I already have a wallet/i })
      .isVisible()
      .catch(() => false);
    const netSelector = await probe
      .locator('[data-testid=network-selector-open]')
      .isVisible()
      .catch(() => false);
    return !welcome && netSelector;
  } finally {
    await probe.close().catch(() => {});
  }
}

async function closeStrayExtensionPages(): Promise<void> {
  const prefix = `chrome-extension://${extensionId}`;
  for (const p of context.pages()) {
    if (!p.isClosed() && p.url().startsWith(prefix)) await p.close().catch(() => {});
  }
}

async function ensureOnboarded(): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await onboardFreighter(context);
    if (await isOnboarded()) {
      await closeStrayExtensionPages();
      return;
    }
  }
  throw new Error('Freighter onboarding did not complete after 3 attempts');
}

test.beforeAll(async () => {
  const launched = await launchWithFreighter(chromium);
  context = launched.context;
  userDataDir = launched.userDataDir;
  extensionId = launched.extensionId;
  await ensureOnboarded();
});

test.afterAll(async () => {
  if (context) await cleanup(context, userDataDir);
});

const APPROVAL_ROUTES = ['grant-access', 'sign-transaction', 'sign-auth-entry', 'sign-message'];
const APPROVE_SELECTOR =
  '[data-testid=grant-access-connect-button], [data-testid=sign-transaction-sign], [data-testid=sign-auth-entry-approve-button], [data-testid=sign-message-approve-button]';

function findApprovalPopup(): Page | null {
  const prefix = `chrome-extension://${extensionId}`;
  for (const p of context.pages()) {
    if (p.isClosed() || !p.url().startsWith(prefix)) continue;
    if (APPROVAL_ROUTES.some((route) => p.url().includes(route))) return p;
  }
  return null;
}

async function snapPopup(popup: Page, grantName: string, signName: string): Promise<void> {
  const url = popup.url();
  const want = url.includes('grant-access')
    ? grantName
    : /sign-transaction|sign-auth/.test(url)
      ? signName
      : null;
  if (!want || captured.has(want)) return;
  await popup
    .locator(APPROVE_SELECTOR)
    .first()
    .waitFor({ state: 'visible', timeout: 4000 })
    .catch(() => {});
  await popup.waitForTimeout(400);
  const ok = await popup
    .screenshot({ path: path.join(SHOTS, want), type: 'jpeg', quality: 85 })
    .then(() => true)
    .catch(() => false);
  if (ok) captured.add(want);
}

async function waitForPopup(ms: number): Promise<Page | null> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const popup = findApprovalPopup();
    if (popup) return popup;
    await sleep(300);
  }
  return null;
}

async function rapidApproveUntil(
  done: () => Promise<boolean>,
  ms: number,
  grantName: string,
  signName: string,
): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await done()) return true;
    const popup = await waitForPopup(8000);
    if (popup) await snapPopup(popup, grantName, signName);
    await approveOnce(context, { timeout: 3500 }).catch(() => {});
    await sleep(200);
  }
  return done();
}

function isConnected(page: Page): Promise<boolean> {
  return page
    .getByTestId('account-chip')
    .isVisible()
    .catch(() => false);
}

async function connectWallet(page: Page): Promise<void> {
  const done = () => isConnected(page);
  for (let attempt = 0; attempt < 6; attempt++) {
    if (await done()) break;
    const connectBtn = page.getByTestId('account-chip-connect');
    await connectBtn.click({ timeout: 15000 }).catch(() => {});
    if (await rapidApproveUntil(done, 45000, 'real-02-connect-popup.jpg', 'real-03-sign-challenge-popup.jpg'))
      break;
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  }
  await expect(page.getByTestId('account-chip')).toBeVisible({ timeout: 20000 });
}

async function assertConnected(page: Page): Promise<void> {
  const chip = page.getByTestId('account-chip');
  await expect(chip).toBeVisible({ timeout: 30000 });
  const text = (await chip.textContent())?.trim() ?? '';
  expect(text).toContain(DEPLOYER_HEAD);
  expect(text).toContain(DEPLOYER_TAIL);
}

/**
 * Mirrors the flow proven to work end-to-end against the live deployment:
 * click Send tip, wait once for the sign-transaction popup, approve it once,
 * then wait for the /api/tips/record response that carries the real tx hash.
 * Deliberately avoids nested rapid-retry loops — those compound each
 * approveOnce's internal 30s waitForEvent('close') timeout into multi-minute
 * hangs when a single click doesn't register.
 */
async function tipOnce(page: Page): Promise<string | null> {
  let txHash: string | null = null;
  const onResp = async (resp: { url(): string; json(): Promise<unknown> }) => {
    if (!resp.url().includes('/api/tips/record')) return;
    const json = (await resp.json().catch(() => null)) as {
      ok?: boolean;
      data?: { tip?: { stellarTxHash?: string } };
    } | null;
    if (json?.ok && json.data?.tip?.stellarTxHash) txHash = json.data.tip.stellarTxHash;
  };
  page.on('response', onResp as never);

  try {
    const sendButton = page.getByRole('button', { name: /^send tip$/i });
    await sendButton.click({ timeout: 15000 });

    const popup = await waitForPopup(20000);
    if (popup) {
      await snapPopup(popup, 'real-04-sign-tip-popup.jpg', 'real-04-sign-tip-popup.jpg');
      await approveOnce(context, { timeout: 15000 }).catch(() => {});
    }

    const deadline = Date.now() + 30000;
    while (Date.now() < deadline && txHash == null) {
      await sleep(500);
    }
    return txHash;
  } finally {
    page.off('response', onResp as never);
  }
}

/**
 * The tip panel reads wallet state from its own `useFreighter()` mount, which
 * is independent of the header's session store — on a fresh page it may
 * briefly (or persistently) render "Connect wallet to tip" instead of "Send
 * tip" even though the header shows connected. Reconnect locally if needed
 * before touching the amount field.
 */
async function ensureTipPanelConnected(page: Page): Promise<void> {
  const panelConnect = page.getByRole('button', { name: /connect wallet to tip/i });
  const sendButton = page.getByRole('button', { name: /^send tip$/i });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await sendButton.isVisible().catch(() => false)) return;
    if (await panelConnect.isVisible().catch(() => false)) {
      await panelConnect.click({ timeout: 5000 }).catch(() => {});
      const popup = await waitForPopup(6000);
      if (popup) {
        await snapPopup(popup, 'real-04a-tip-panel-reconnect-popup.jpg', 'real-04a-tip-panel-reconnect-popup.jpg');
        await approveOnce(context, { timeout: 3500 }).catch(() => {});
      }
    }
    await sleep(500);
  }
}

async function sendTipOnChain(page: Page): Promise<string> {
  await ensureTipPanelConnected(page);
  const amount = page.locator('#tip-amount');
  await expect(amount).toBeVisible({ timeout: 30000 });
  await amount.fill('1');

  const sendButton = page.getByRole('button', { name: /^send tip$/i });
  await expect(sendButton, 'tip panel must show Send tip, not Connect wallet to tip').toBeVisible({
    timeout: 15000,
  });

  let txHash: string | null = null;
  for (let attempt = 1; attempt <= TIP_RETRIES && !txHash; attempt++) {
    txHash = await tipOnce(page);
    if (!txHash && attempt < TIP_RETRIES) await page.waitForTimeout(4000);
  }
  expect(txHash, 'on-chain tip must return a real tx hash').toBeTruthy();
  return txHash as string;
}

async function assertOnChainTx(page: Page, txHash: string): Promise<void> {
  expect(txHash).toMatch(/^[0-9a-f]{64}$/);
  const horizon = await page.request
    .get(`https://horizon.stellar.org/transactions/${txHash}`)
    .catch(() => null);
  expect(horizon?.ok(), 'tip tx must be confirmed on Stellar testnet Horizon').toBeTruthy();
  const expert = await page.request
    .get(`https://stellar.expert/explorer/public/tx/${txHash}`)
    .catch(() => null);
  expect((expert?.status() ?? 500) < 500, 'stellar.expert testnet link must resolve').toBeTruthy();
}

test('real Freighter: connect grant + SEP-10 + on-chain tip -> real tx hash', async () => {
  test.setTimeout(540000);
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30000 });
  await shot(page, 'real-01-landing.jpg');

  await connectWallet(page);
  await assertConnected(page);

  await page.goto(`${BASE_URL}/c/${TIP_HANDLE}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30000 });
  await shot(page, 'real-05-creator-connected.jpg');

  const txHash = await sendTipOnChain(page);

  await page.waitForTimeout(1500);
  await shot(page, 'real-06-tip-sent.jpg');

  await assertOnChainTx(page, txHash);

  await page.goto(`https://stellar.expert/explorer/public/tx/${txHash}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(3000);
  await shot(page, 'real-07-stellar-expert.jpg');

  // biome-ignore lint/suspicious/noConsole: surface the real tx hash for the run report
  console.log('CORE_FLOW_TX=' + txHash);
});

test('mobile landing renders', async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 30000 });
  await shot(page, 'real-08-mobile.jpg');
});
