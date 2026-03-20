import { expect, test } from '@playwright/test';

test('runs subscriber sync and shows sync outcomes in admin UI', async ({ page }) => {
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

  await page.getByLabel('Email').fill('admin@supermailer.local');
  await page.getByLabel('Password').fill('supermailer-admin');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL(/\/subscribers$/);
  await page.getByTestId('subscriber-sync-endpoint-input').fill(syncSourceUrl);
  await page.getByRole('button', { name: 'Run Subscriber Sync' }).click();

  await expect(page.getByTestId('subscriber-list')).toContainText('alice@example.com');
  await expect(page.getByTestId('subscriber-list')).toContainText('bob@gmail.com');
  await expect(page.getByTestId('subscriber-list')).toContainText('Eligibility: unsubscribed');

  await expect(page.getByTestId('sync-run-list')).toContainText('crm');
  await expect(page.getByTestId('sync-run-list')).toContainText('processed 3, created 2, updated 0, failed 1');
  await expect(page.getByTestId('sync-run-list')).toContainText('alice@example.com — created');
  await expect(page.getByTestId('sync-run-list')).toContainText('bob@gmail.com — created');
  await expect(page.getByTestId('sync-run-list')).toContainText('Email address must be valid');

  await page.getByRole('button', { name: 'Mark Hard Bounce' }).first().click();
  await expect(page.getByTestId('subscriber-list')).toContainText('hard_bounce');
});
