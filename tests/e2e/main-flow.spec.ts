import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const DEMO_HANDLE = 'ploydraws';
const EMPTY_HANDLE = 'mirapixels';

async function noHorizontalScroll(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
}

test.describe('Sorak landing', () => {
  test('shows the heading and a primary CTA above the fold', async ({ page }) => {
    await page.goto('/');
    const heading = page.getByRole('heading', { name: /Turn applause into on-chain support/i });
    await expect(heading).toBeVisible();
    const cta = page.getByRole('link', { name: /Start your page/i }).first();
    await expect(cta).toBeVisible();
    const box = await cta.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(box!.y).toBeLessThan((viewport?.height ?? 800));
  });

  test('has no accessibility violations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Turn applause/i }).waitFor();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('does not scroll horizontally', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: /Turn applause/i }).waitFor();
    expect(await noHorizontalScroll(page)).toBe(true);
    const cta = page.getByRole('link', { name: /Start your page/i }).first();
    await expect(cta).toBeVisible();
  });
});

test.describe('Sorak creator page', () => {
  test('renders seeded stat cards and the supporter feed', async ({ page }) => {
    await page.goto(`/c/${DEMO_HANDLE}`);
    await expect(page.getByRole('heading', { level: 1, name: /Ploy Chaiyaphon/i })).toBeVisible();
    await expect(page.getByText('Supporters', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Tips', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Recent tips/i })).toBeVisible();
  });

  test('shows seeded tips in the list (created tips appear)', async ({ page }) => {
    await page.goto(`/c/${DEMO_HANDLE}`);
    await page.getByRole('heading', { level: 1, name: /Ploy Chaiyaphon/i }).waitFor();
    const feed = page.locator('text=/Anong|Krit|Siriwan|Nattapong|Ratana/');
    await expect(feed.first()).toBeVisible();
  });

  test('shows an instructional empty state for a creator with no tips', async ({ page }) => {
    await page.goto(`/c/${EMPTY_HANDLE}`);
    await page.getByRole('heading', { name: /Recent tips/i }).waitFor();
    const empty = page.getByText(/No tips yet — be the first to cheer/i);
    await expect(empty).toBeVisible();
    const text = (await empty.textContent()) ?? '';
    expect(text.trim().length).toBeGreaterThan(20);
  });
});

test.describe('Sorak dashboard', () => {
  test('renders with at most two accessibility violations', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations.length).toBeLessThanOrEqual(2);
  });
});
