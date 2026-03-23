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
  await page.waitForURL('/subscribers');

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

  // Let's create a send and ingest a delivery event to make sure it shows up
  const templateName = `event_flow_template_${createUniqueSuffix()}`;
  const templateCreateResponse = await page.request.post('/api/templates', {
    data: {
      name: templateName,
      subject: 'Event test',
      html: '<p>Test</p>',
    },
  });
  expect(templateCreateResponse.ok()).toBeTruthy();

  const recipient = `events-${createUniqueSuffix()}@example.com`;

  await page.getByRole('button', { name: /발송 관리/ }).click();
  await page.waitForURL('/sends');

  await page.selectOption('[data-testid="individual-send-template"]', {
    label: templateName,
  });
  await page.fill('[data-testid="individual-send-to"]', recipient);

  const sendRequest = page.waitForResponse(
    (response) =>
      response.url().includes('/api/admin/individual-sends') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '개별 발송하기' }).click();
  await sendRequest;

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
