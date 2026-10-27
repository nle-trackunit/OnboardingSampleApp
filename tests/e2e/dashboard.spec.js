// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Onboarding Dashboard', () => {
  test('should display the dashboard heading', async ({ page }) => {
    await page.goto('/');

    // Verify the main heading is visible
    await expect(page.locator('h1')).toContainText('Onboarding Dashboard');
  });

  test('should show navigation tabs', async ({ page }) => {
    await page.goto('/');

    // Verify all navigation tabs are present
    await expect(page.locator('.tab')).toHaveCount(5);
    await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Customer Info' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Data Mapping' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tenant Setup' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import' })).toBeVisible();
  });

  test('should display example customer in onboarding queue', async ({ page }) => {
    await page.goto('/');

    // Wait for data to load and verify example customer is shown
    await expect(
      page.locator('.customer-card h3', { hasText: 'Acme Corporation' })
    ).toBeVisible();
  });

  test('should switch between tabs', async ({ page }) => {
    await page.goto('/');

    // Click on Customer Info tab
    await page.getByRole('button', { name: 'Customer Info' }).click();
    
    // Verify the customer info form is shown
    await expect(page.locator('h2')).toContainText('Customer Info');
    await expect(page.locator('.customer-form')).toBeVisible();
  });
});

test.describe('Customer Info form', () => {
  test('should show validation errors for empty submission', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Customer Info' }).click();
    await page.getByRole('button', { name: 'Save customer' }).click();

    await expect(page.getByText('Name is required')).toBeVisible();
    await expect(page.getByText('Contact email is required')).toBeVisible();
  });

  test('should add a new customer to the onboarding queue', async ({ page }) => {
    const name = `Globex ${Date.now()}`;

    await page.goto('/');
    await page.getByRole('button', { name: 'Customer Info' }).click();
    await page.getByLabel('Customer name').fill(name);
    await page.getByLabel('Industry').fill('Energy');
    await page.getByLabel('Region').fill('EMEA');
    await page.getByLabel('Contact email').fill('ops@globex.example.com');
    await page.getByRole('button', { name: 'Save customer' }).click();

    await expect(page.getByRole('status')).toContainText(`${name} was added`);

    await page.getByRole('button', { name: 'Dashboard' }).click();
    const card = page.locator('.customer-card', { hasText: name });
    await expect(card).toBeVisible();
    await expect(card.locator('.progress-bar')).toContainText('25%');
  });
});
