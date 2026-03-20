import { expect, test } from '@playwright/test';

test('admin login protects routes and grants subscriber access', async ({ page, context }) => {
  await page.goto('/subscribers');
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Email').fill('admin@supermailer.local');
  await page.getByLabel('Password').fill('supermailer-admin');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL(/\/subscribers$/);
  await expect(page.getByRole('heading', { name: 'Subscribers' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Subscriber Directory' })).toBeVisible();

  const cookies = await context.cookies();
  const sessionCookie = cookies.find((cookie) => cookie.name === 'supermailer_admin_session');
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(sessionCookie?.secure).toBe(true);
});
