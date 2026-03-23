import { expect, test } from '@playwright/test';

test('restores api-key scope selection from query string without leaking secrets', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('이메일').fill('admin@supermailer.local');
  await page.getByLabel('비밀번호').fill('supermailer-admin');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.waitForURL('/subscribers');

  await page.getByRole('button', { name: /API Keys/ }).click();
  await page.waitForURL('/access-keys');

  await page.getByTestId('api-key-scope-individual-send').check();
  await page.getByTestId('api-key-scope-campaign-send').check();
  await expect(page).toHaveURL(/scope=campaign-send/);
  await expect(page).toHaveURL(/scope=individual-send/);

  await page.reload();
  await expect(page).toHaveURL(/\/access-keys/);
  await expect(
    page.getByRole('heading', { name: '외부 연동 API 키' }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.locator('[data-testid="api-key-scope-individual-send"]'),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('api-key-scope-individual-send')).toBeChecked();
  await expect(page.getByTestId('api-key-scope-campaign-send')).toBeChecked();

  await page.goto('/access-keys?scope=campaign-send');
  await expect(page.getByTestId('api-key-scope-campaign-send')).toBeChecked();
  await expect(
    page.getByTestId('api-key-scope-subscriber-sync'),
  ).not.toBeChecked();

  await page.getByRole('textbox').fill('URL Safety Key');
  await page.getByRole('button', { name: 'API 키 생성' }).click();
  await expect(page.getByTestId('created-api-key')).toBeVisible();
  expect(page.url()).not.toContain('URL Safety Key');
  expect(page.url()).not.toContain('created-api-key');

  await page.getByTestId('api-key-scope-subscriber-sync').check();
  await page.getByTestId('api-key-scope-campaign-send').uncheck();
  await page.getByTestId('api-key-scope-individual-send').uncheck();
  expect(new URL(page.url()).search).toBe('');
});
