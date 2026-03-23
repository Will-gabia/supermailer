import { expect, test } from '@playwright/test';

test('runs subscriber sync and shows sync outcomes in admin UI', async ({
  page,
}) => {
  const syncSourceUrl = `data:application/json,${encodeURIComponent(
    JSON.stringify({
      subscribers: [
        {
          externalId: 'crm-alice',
          email: 'Alice@Example.com',
          displayName: 'Alice Imported',
          unsubscribed: false,
          metadata: { segment: 'vip' },
        },
        {
          externalId: 'crm-bob',
          email: 'bob@gmail.com',
          displayName: 'Bob Imported',
          unsubscribed: true,
          metadata: { segment: 'standard' },
        },
        {
          externalId: 'crm-invalid',
          email: 'broken',
          displayName: 'Broken Import',
          unsubscribed: false,
        },
      ],
    }),
  )}`;

  await page.goto('/subscribers');
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('이메일').fill('admin@supermailer.local');
  await page.getByLabel('비밀번호').fill('supermailer-admin');
  await page.getByRole('button', { name: '로그인' }).click();

  await expect(page).toHaveURL(/\/subscribers$/);
  await page.getByTestId('subscriber-sync-endpoint-input').fill(syncSourceUrl);
  await page.getByRole('button', { name: '동기화 실행' }).click();

  await expect(page.getByTestId('subscriber-list')).toContainText(
    'alice@example.com',
  );
  await expect(page.getByTestId('subscriber-list')).toContainText(
    'bob@gmail.com',
  );
  await expect(page.getByTestId('subscriber-list')).toContainText('수신 거부');

  await expect(page.getByTestId('sync-run-list')).toContainText('crm');
  await expect(page.getByTestId('sync-run-list')).toContainText('처리: 3');
  await expect(page.getByTestId('sync-run-list')).toContainText('실패: 1');

  await page.getByRole('button', { name: '하드바운스 처리' }).first().click();
  await expect(page.getByTestId('subscriber-list')).toContainText(
    '억제됨 (hard_bounce)',
  );
});
