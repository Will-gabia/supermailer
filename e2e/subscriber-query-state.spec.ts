import { expect, test } from '@playwright/test';

test('restores subscriber tab state from query string and reloads', async ({
  page,
}) => {
  await page.goto('/subscribers');
  await page.getByLabel('이메일').fill('admin@supermailer.local');
  await page.getByLabel('비밀번호').fill('supermailer-admin');
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page).toHaveURL(/\/subscribers$/);

  await page.getByTestId('subscriber-tab-unsubscribed').click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('tab'))
    .toBe('unsubscribed');
  await expect(page.getByTestId('subscriber-list')).toContainText('수신 거부');

  await page.reload();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('tab'))
    .toBe('unsubscribed');
  await expect(page.getByTestId('subscriber-list')).toContainText('수신 거부');

  await page.goto('/subscribers?tab=suppressed');
  await expect(page.getByTestId('subscriber-tab-suppressed')).toHaveAttribute(
    'data-testid',
    'subscriber-tab-suppressed',
  );
  await expect
    .poll(() => new URL(page.url()).searchParams.get('tab'))
    .toBe('suppressed');
  await expect(page.getByTestId('subscriber-list')).toContainText('억제됨');

  await page.getByTestId('subscriber-tab-all').click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('tab'))
    .toBe(null);
});
