import { expect, test } from '@playwright/test';

test('restores api-key scope selection from query string without leaking secrets', async ({
  page,
}) => {
  const apiKeyLabel = `URL Safety Key ${Date.now().toString(36)}`;

  await page.goto('/login');
  await page.getByLabel('이메일').fill('admin@supermailer.local');
  await page.getByLabel('비밀번호').fill('supermailer-admin');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.waitForURL('/sends');

  await page.getByRole('button', { name: /API Keys/ }).click();
  await page.waitForURL('/access-keys');

  await page.reload();
  await expect(page).toHaveURL(/\/access-keys/);
  await expect(
    page.getByRole('heading', { name: '외부 연동 API 키' }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.locator('[data-testid="api-key-scope-individual-send"]'),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('api-key-scope-individual-send')).toBeChecked();

  await page.goto('/access-keys?scope=individual-send');
  await expect(page.getByTestId('api-key-scope-individual-send')).toBeChecked();

  await page.getByRole('textbox').fill(apiKeyLabel);
  await page.getByRole('button', { name: 'API 키 생성' }).click();
  await expect(page.getByTestId('created-api-key')).toBeVisible();
  await expect(page.getByTestId('api-key-list')).toContainText(apiKeyLabel);
  await expect(page.getByTestId('api-key-list')).toContainText('활성');
  expect(page.url()).not.toContain(apiKeyLabel);
  expect(page.url()).not.toContain('created-api-key');

  const createdApiKeyRow = page
    .getByTestId('api-key-list')
    .locator('tbody tr', { hasText: apiKeyLabel });
  await expect(createdApiKeyRow).toContainText(apiKeyLabel);
  await createdApiKeyRow.getByRole('button', { name: '폐기' }).click();
  await expect(createdApiKeyRow).toContainText('폐기됨');

  await createdApiKeyRow.getByRole('button', { name: '삭제' }).click();
  await expect(createdApiKeyRow).toHaveCount(0);

  await page.getByTestId('api-key-scope-individual-send').uncheck();
  expect(new URL(page.url()).search).toBe('');
});
