import { expect, test } from '@playwright/test';

const SHOTS = 'e2e/screenshots';
const ROLES = { admin: 'Admin', lead: 'Test Lead', tester: 'Tester', viewer: 'Read Only' };

async function login(page, role) {
  await page.goto('/login');
  await page.getByRole('button', { name: ROLES[role], exact: true }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}


test('unauthenticated users are redirected to login', async ({ page }) => {
  await page.goto('/testcases');
  await expect(page).toHaveURL(/\/login$/);
  await page.screenshot({ path: `${SHOTS}/01-login.png` });
});

for (const role of Object.keys(ROLES)) {
  test(`login and dashboard charts render for ${role}`, async ({ page }) => {
    await login(page, role);
    await expect(page.locator('.role-pill').first()).toHaveText(ROLES[role]);
    // Pie, line, rate bar, tester bar, defect bar
    await expect(page.locator('.recharts-wrapper')).toHaveCount(5, { timeout: 15_000 });
    await expect(page.locator('.stat-value').first()).not.toHaveText('0');
    if (role === 'admin') await page.screenshot({ path: `${SHOTS}/02-dashboard.png`, fullPage: true });
    // Legend toggle hides a series (interactive chart)
    if (role === 'lead') {
      await page.locator('.recharts-legend-item', { hasText: 'Fail' }).first().click();
      await expect(page.locator('.recharts-legend-item-text', { hasText: 'Fail' }).first().locator('span')).toHaveCSS('text-decoration-line', 'line-through');
    }
    await expect(page.getByRole('link', { name: /Users/ })).toHaveCount(role === 'admin' ? 1 : 0);
  });
}

test('read-only user sees no edit or execute controls', async ({ page }) => {
  await login(page, 'viewer');
  await page.getByRole('link', { name: /Test Cases/ }).click();
  await expect(page.getByText(/matching/)).toBeVisible();
  await expect(page.getByRole('button', { name: '+ New test case' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Import CSV' })).toHaveCount(0);
  await expect(page.locator('.tc-row input[type=checkbox]')).toHaveCount(0);
  await page.locator('.tc-title a').first().click();
  await expect(page.getByRole('heading', { name: 'Execute' })).toBeVisible();
  for (const r of ['Pass', 'Fail', 'Blocked', 'Skipped']) await expect(page.getByRole('button', { name: r, exact: true })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);
  await expect(page.getByText('Your role can view results but not execute tests.')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/03-readonly-testcase.png`, fullPage: true });
  // Admin-only route is not reachable
  await page.goto('/users');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('tester can execute but not create test cases', async ({ page }) => {
  await login(page, 'tester');
  await page.getByRole('link', { name: /Test Cases/ }).click();
  await expect(page.getByRole('button', { name: '+ New test case' })).toHaveCount(0);
  await page.locator('.tc-title a').first().click();
  await page.getByRole('button', { name: 'Fail', exact: true }).click();
  await page.getByLabel('Execution comments').fill('Checkout total is wrong');
  await page.getByRole('button', { name: 'Record result' }).click();
  await expect(page.getByText(/Recorded\s+Fail/)).toBeVisible();
  await page.getByRole('button', { name: 'Raise defect' }).click();
  await expect(page.getByRole('dialog')).toContainText('Raise defect');
  await page.getByRole('button', { name: 'Create defect' }).click();
  await expect(page.getByText(/Defect #\d+ created/)).toBeVisible();
  await page.getByRole('tab', { name: 'Execution history' }).click();
  await expect(page.locator('.timeline-item').first()).toContainText('Checkout total is wrong');
});

test('test case list: search, filters and infinite pagination', async ({ page }) => {
  await login(page, 'lead');
  await page.getByRole('link', { name: /Test Cases/ }).click();
  const count = page.locator('.page-header p.muted');
  await expect(count).toContainText('126 matching · 50 loaded');
  // Virtual list renders only a window of rows
  expect(await page.locator('.virtual-list .tc-row').count()).toBeLessThan(50);
  await page.locator('.virtual-list').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(count).toContainText('100 loaded');
  await page.screenshot({ path: `${SHOTS}/04-testcases.png` });

  await page.getByLabel('Search test cases').fill('Checkout');
  await expect(count).toContainText('10 matching');
  await page.locator('summary', { hasText: 'Priority' }).click();
  await page.getByRole('checkbox', { name: 'Critical' }).check();
  await expect(count).toContainText(/^[1-9] matching/);
  await expect(page).toHaveURL(/priority=Critical/);
  for (const badge of await page.locator('.virtual-list .tc-row .badge-outline').allTextContents()) expect(badge).toBe('Critical');
  await page.getByRole('button', { name: /Clear/ }).click();
  await expect(count).toContainText('126 matching');
});

test('lead creates and edits a test case', async ({ page }) => {
  await login(page, 'lead');
  await page.goto('/testcases/new');
  await page.locator('input[name=title]').fill('E2E: guest checkout with promo code');
  await page.locator('select[name=priority]').selectOption('High');
  await page.locator('select[name=type]').selectOption('Integration');
  await page.getByPlaceholder('add tag').fill('e2e');
  await page.getByPlaceholder('add tag').press('Enter');
  await page.getByLabel('Step 1 action').fill('Add product to cart');
  await page.getByLabel('Step 1 expected result').fill('Cart shows 1 item');
  await page.getByRole('button', { name: '+ Add step' }).click();
  await page.getByLabel('Step 2 action').fill('Apply code SAVE10');
  await page.getByLabel('Step 2 expected result').fill('Total reduced by 10%');
  await page.getByRole('button', { name: 'Create test case' }).click();
  await expect(page.getByRole('heading', { name: 'E2E: guest checkout with promo code' })).toBeVisible();
  await expect(page.locator('table tbody tr')).toHaveCount(2);

  await page.getByRole('link', { name: 'Edit' }).click();
  await page.locator('input[name=title]').fill('E2E: guest checkout with promo code (edited)');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: /\(edited\)/ })).toBeVisible();
  await expect(page.getByText(/^v2 ·/)).toBeVisible();
  await page.getByRole('tab', { name: 'Versions' }).click();
  await expect(page.getByRole('cell', { name: 'v2' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/05-testcase-detail.png`, fullPage: true });
});

test('lead creates a suite, runs it and records results', async ({ page }) => {
  await login(page, 'lead');
  await page.getByRole('link', { name: /Test Suites/ }).click();
  await page.getByRole('button', { name: '+ New suite' }).click();
  await page.getByRole('dialog').locator('input').fill('E2E Suite');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'E2E Suite' })).toBeVisible();
  await page.getByRole('button', { name: '+ Add cases' }).click();
  await page.getByRole('dialog').getByLabel('Search').fill('Payments');
  const rows = page.locator('.pick-row input');
  await expect(page.locator('.pick-row').first()).toContainText('Payments');
  await rows.nth(0).check();
  await rows.nth(1).check();
  await page.getByRole('button', { name: 'Add 2' }).click();
  await expect(page.getByRole('heading', { name: 'Test cases (2)' })).toBeVisible();

  await page.getByRole('button', { name: '▶ Run suite' }).click();
  await expect(page.getByText('0 of 2 executed')).toBeVisible();
  await page.getByRole('button', { name: 'Pass', exact: true }).click();
  await page.getByRole('button', { name: 'Record result' }).click();
  await expect(page.getByText('1 of 2 executed')).toBeVisible();
  await expect(page.getByText('Case 2 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Blocked', exact: true }).click();
  await page.getByRole('button', { name: 'Record result' }).click();
  await expect(page.getByText('2 of 2 executed')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/06-suite-run.png`, fullPage: true });
  await page.getByRole('button', { name: 'Complete run' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Complete' }).click();
  await expect(page.locator('.page-header .run-status')).toHaveText('completed');

  await page.getByRole('link', { name: 'E2E Suite' }).click();
  await expect(page.getByText('50%')).toBeVisible(); // 1 pass of 2 executed
});

test('lead creates a project and navigates projects', async ({ page }) => {
  await login(page, 'lead');
  await page.getByRole('link', { name: /Projects/ }).click();
  await page.getByRole('button', { name: '+ New project' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input').first().fill('E2E Project');
  await dialog.locator('textarea').fill('Created by Playwright');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'E2E Project' })).toBeVisible();
  await expect(page.getByLabel('Current project')).toHaveValue(/\d+/);
  await expect(page.getByLabel('Current project').locator('option:checked')).toHaveText(/E2E Project/);
  await page.getByLabel('User to add').selectOption({ label: 'Tara Tester · Tester' });
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Tara Tester' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/07-project.png`, fullPage: true });
  // Empty project: dashboard still renders
  await page.getByRole('link', { name: /Dashboard/ }).click();
  await expect(page.locator('.stat-value').first()).toHaveText('0');
  // Switch back
  await page.getByLabel('Current project').selectOption({ label: 'E-Commerce Web App v2.3 ' });
  await expect(page.locator('.stat-value').first()).toHaveText(/\d{3}/);
});

test('admin user management and performance page', async ({ page }) => {
  await login(page, 'admin');
  await page.getByRole('link', { name: /Users/ }).click();
  await expect(page.getByRole('cell', { name: 'Victor Viewer' })).toBeVisible();
  await page.getByRole('link', { name: /Performance/ }).click();
  await page.getByRole('button', { name: 'Run cache benchmark' }).click();
  await expect(page.getByRole('heading', { name: /Benchmark/ })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Analytics dashboard' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/08-performance.png`, fullPage: true });
});

test('dark mode and responsive layout', async ({ page }) => {
  await login(page, 'tester');
  await page.getByRole('button', { name: /Switch to dark mode/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.recharts-surface').first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/09-dark-dashboard.png`, fullPage: true });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.setViewportSize({ width: 390, height: 844 });
  const sidebar = page.locator('.sidebar');
  await expect(page.getByRole('button', { name: 'Toggle navigation' })).toBeVisible();
  await expect(sidebar).not.toBeInViewport();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SHOTS}/10-mobile-dashboard.png`, fullPage: true });
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await expect(sidebar).toBeInViewport();
  await page.getByRole('link', { name: /Test Cases/ }).click();
  await expect(sidebar).not.toBeInViewport();
  await expect(page.locator('.tc-row').nth(1)).toBeVisible();
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow2).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SHOTS}/11-mobile-testcases.png` });
});
