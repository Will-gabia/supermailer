import { expect, test } from '@playwright/test';

test('restores routing section state from query string and reloads', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('이메일').fill('admin@supermailer.local');
  await page.getByLabel('비밀번호').fill('supermailer-admin');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.waitForURL('/subscribers');

  await page.getByRole('button', { name: /Routing/ }).click();
  await page.waitForURL('/routing');

  await page.getByTestId('routing-section-preview').click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('section'))
    .toBe('preview');
  await expect(page.getByTestId('routing-section-preview')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.reload();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('section'))
    .toBe('preview');
  await expect(page.getByTestId('routing-card-preview')).toBeVisible();

  await page.goto('/routing?section=rules');
  await expect(page.getByTestId('routing-section-rules')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByTestId('routing-section-nodes').click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('section'))
    .toBe(null);
});
