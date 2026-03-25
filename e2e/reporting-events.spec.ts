import { expect, test } from '@playwright/test';

const createUniqueSuffix = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

test('delivery reporting and event history display correctly', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('이메일').fill('admin@supermailer.local');
  await page.getByLabel('비밀번호').fill('supermailer-admin');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.waitForURL('/sends');

  // Verify reporting page
  await page.getByRole('button', { name: /리포트/ }).click();
  await page.waitForURL('/reporting');
  await expect(page.locator('text="리포트 및 통계"')).toBeVisible();
  await expect(
    page.locator('[data-testid="reporting-status-counts"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-testid="reporting-code-histogram"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-testid="reporting-node-breakdown"]'),
  ).toBeVisible();

  const recipient = `events-${createUniqueSuffix()}@example.com`;
  const apiKeyResponse = await page.request.post('/api/api-keys', {
    data: {
      label: `reporting-events-${createUniqueSuffix()}`,
      scopes: ['individual-send'],
    },
  });
  expect(apiKeyResponse.status()).toBe(201);
  const apiKeyPayload = (await apiKeyResponse.json()) as {
    data: { rawKey: string };
  };
  const callbackEndpointResponse = await page.request.post(
    '/api/callback-endpoints',
    {
      headers: {
        'x-api-key': apiKeyPayload.data.rawKey,
      },
      data: {
        label: `reporting-events-webhook-${createUniqueSuffix()}`,
        targetUrl: 'http://localhost:4010/webhooks/result',
      },
    },
  );
  expect(callbackEndpointResponse.status()).toBe(201);
  const callbackEndpointPayload = (await callbackEndpointResponse.json()) as {
    data: { id: string };
  };

  await page.getByRole('button', { name: /발송 관리/ }).click();
  await page.waitForURL('/sends');

  const sendResponse = await page.request.post('/api/sends', {
    headers: {
      'x-api-key': apiKeyPayload.data.rawKey,
    },
    data: {
      eml: [
        'From: sender@example.com',
        `To: ${recipient}`,
        'Subject: Event test',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        '',
        'Event test body',
      ].join('\r\n'),
      callbackEndpointId: callbackEndpointPayload.data.id,
    },
  });
  expect(sendResponse.status()).toBe(202);
  await page.reload();
  await page.getByTestId('send-recipient-search').fill(recipient);

  // Find the send in the list
  const sendList = page.locator('[data-testid="send-list"]');
  const sendRow = sendList.locator('tr', { hasText: recipient }).first();
  await expect(sendRow).toBeVisible({ timeout: 15000 });

  await expect(
    sendRow.getByRole('button', { name: '이력 보기' }),
  ).toBeEnabled();

  // Click View History
  await sendRow.getByRole('button', { name: '이력 보기' }).click();

  // Wait for events panel to load
  const eventsPanel = page
    .locator(`[data-testid^="send-events-"]`)
    .filter({ hasText: '배달 이벤트' });
  await expect(eventsPanel).toBeVisible();

  // Verify webhook panel shows up for this individual send
  const webhookPanel = page.locator(`[data-testid^="send-webhook-"]`);
  await expect(webhookPanel).toBeVisible();
  await expect(webhookPanel).toContainText('웹훅 상태');
  await expect(webhookPanel).toContainText(
    'http://localhost:4010/webhooks/result',
  );
  await expect(
    webhookPanel.locator('[data-testid="webhook-status"]'),
  ).toBeVisible();
});
