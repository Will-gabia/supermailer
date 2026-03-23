import { expect, test } from '@playwright/test';

test('restores reporting section state from query string and reloads', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('이메일').fill('admin@supermailer.local');
  await page.getByLabel('비밀번호').fill('supermailer-admin');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.waitForURL('/subscribers');

  await page.getByRole('button', { name: /리포트/ }).click();
  await page.waitForURL('/reporting');

  await page.getByTestId('reporting-section-codes').click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('section'))
    .toBe('codes');
  await expect(page.getByTestId('reporting-section-codes')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.reload();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('section'))
    .toBe('codes');
  await expect(page.getByTestId('reporting-section-codes')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.goto('/reporting?section=nodes');
  await expect(page.getByTestId('reporting-section-nodes')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByTestId('reporting-section-status').click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('section'))
    .toBe(null);
  await expect(page.getByTestId('reporting-section-status')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
