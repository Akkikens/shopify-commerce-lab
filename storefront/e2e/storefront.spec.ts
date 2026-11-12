import { expect, test } from '@playwright/test';

// Wireless Ergonomic Mouse on ClickyCanvas (mechanical-keyboards.mock.shop):
// price 49.99 with compare-at 64.99 — a stable on-sale product in the mock catalog.
const ON_SALE = '/products/wireless-ergonomic-mouse';

test('home renders the mock.shop catalog with prices', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Keyboards/);
  await expect(page.getByTestId('product-grid').locator('li')).not.toHaveCount(0);
  await expect(page.getByTestId('market-info')).toContainText('Market requested: US');
  await expect(page.getByTestId('price-current').first()).toContainText('$');
});

test('product page shows price vs compare-at price and a spec table', async ({ page }) => {
  await page.goto(ON_SALE);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Wireless Ergonomic Mouse');
  await expect(page.getByTestId('price-current')).toHaveText('$49.99');
  await expect(page.getByTestId('price-compare-at')).toHaveText('$64.99');
  await expect(page.getByTestId('price-saving')).toHaveText('Save 23%');
  const specs = page.getByTestId('spec-table');
  await expect(specs).toBeVisible();
  await expect(specs.getByRole('row').first()).toBeVisible();
});

test('market switcher moves to the Canada market URL and @inContext', async ({ page }) => {
  await page.goto(ON_SALE);
  await page.getByRole('navigation', { name: 'Market' }).getByRole('link', { name: /Canada/ }).click();
  await expect(page).toHaveURL(/\/en-ca\/products\/wireless-ergonomic-mouse$/);
  await expect(page.getByTestId('market-info')).toContainText('Market requested: CA');
  // ClickyCanvas only sells in USD, so Shopify still prices in USD; the en-CA formatter
  // disambiguates the currency symbol. A store with a CAD market would return CAD here.
  await expect(page.getByTestId('price-current')).toHaveText('US$49.99');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('unknown market prefixes and products 404', async ({ page }) => {
  expect((await page.goto('/xx/products/wireless-ergonomic-mouse'))?.status()).toBe(404);
  expect((await page.goto('/products/this-product-does-not-exist'))?.status()).toBe(404);
});
