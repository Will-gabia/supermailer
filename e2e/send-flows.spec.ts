import { expect, test } from '@playwright/test';

const createUniqueSuffix = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

test('individual and campaign send flows enqueue and show queued statuses', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('이메일').fill('admin@supermailer.local');
  await page.getByLabel('비밀번호').fill('supermailer-admin');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.waitForURL('/subscribers');

  const templateName = `send_flow_template_${createUniqueSuffix()}`;
  const templateCreateResponse = await page.request.post('/api/templates', {
    data: {
      name: templateName,
      subject: 'Hello {{firstName}}',
      html: '<p>Hello {{firstName}}</p>',
    },
  });
  expect(templateCreateResponse.ok()).toBeTruthy();

  const suppressedEmail = `hardbounce-${createUniqueSuffix()}@example.com`;
  const campaignRecipient = `campaign-${createUniqueSuffix()}@gmail.com`;
  const campaignGroupName = `발송 그룹 ${createUniqueSuffix()}`;
  const manualRecipient = `manual-${createUniqueSuffix()}@example.com`;

  await page.getByRole('button', { name: /구독자 관리/ }).click();
  await page.waitForURL('/subscribers');
  await page.fill('[data-testid="subscriber-email-input"]', suppressedEmail);
  await page.fill(
    '[data-testid="subscriber-display-name-input"]',
    'Hard Bounce',
  );
  await page.getByRole('button', { name: '추가하기' }).click();
  const hardBounceSubscriber = page.locator(
    `[data-testid="subscriber-${suppressedEmail}"]`,
  );
  await expect(hardBounceSubscriber).toBeVisible();
  await hardBounceSubscriber
    .getByRole('button', { name: '하드바운스 처리' })
    .click();

  await page.getByLabel('새 그룹 이름').fill(campaignGroupName);
  await page.getByRole('button', { name: '그룹 추가' }).click();

  await page.fill('[data-testid="subscriber-email-input"]', campaignRecipient);
  await page.fill(
    '[data-testid="subscriber-display-name-input"]',
    'Campaign Member',
  );
  await page.getByRole('button', { name: '추가하기' }).click();
  const groupedSubscriber = page.locator(
    `[data-testid="subscriber-${campaignRecipient}"]`,
  );
  await expect(groupedSubscriber).toBeVisible();
  await groupedSubscriber.getByRole('button', { name: '정보 수정' }).click();
  await page.getByLabel(`${campaignGroupName} 그룹 선택`).check();
  await page.getByRole('button', { name: '수정 저장' }).click();
  await expect(
    groupedSubscriber.locator('.badge-info', { hasText: campaignGroupName }),
  ).toBeVisible();

  await page.getByRole('button', { name: /발송 관리/ }).click();
  await page.waitForURL('/sends');

  await page.selectOption('[data-testid="individual-send-template"]', {
    label: templateName,
  });
  await page.fill('[data-testid="individual-send-to"]', 'alice@example.com');
  const individualSendResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/admin/individual-sends') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '개별 발송하기' }).click();
  expect((await individualSendResponse).status()).toBe(202);

  await page.selectOption('[data-testid="campaign-send-template"]', {
    label: templateName,
  });
  await page.fill(
    '[data-testid="campaign-send-recipients"]',
    `${manualRecipient}\n${suppressedEmail}`,
  );
  await page.getByLabel(`${campaignGroupName} 발송 그룹 선택`).check();
  await expect(page.getByTestId('campaign-audience-preview')).toContainText(
    '선택한 그룹 기준 1명',
  );
  const campaignSendResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/admin/campaign-sends') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '캠페인 큐에 등록' }).click();
  expect((await campaignSendResponse).status()).toBe(202);

  const sendList = page.locator('[data-testid="send-list"]');
  await expect(sendList).toContainText('alice@example.com', { timeout: 15000 });
  await expect(sendList).toContainText(campaignRecipient, { timeout: 15000 });
  await expect(sendList).toContainText(manualRecipient, { timeout: 15000 });
  await expect(sendList).not.toContainText(suppressedEmail);

  const campaignSendRow = sendList
    .locator('tr', { hasText: campaignRecipient })
    .first();
  const manualSendRow = sendList
    .locator('tr', { hasText: manualRecipient })
    .first();
  const individualSendRow = sendList
    .locator('tr', { hasText: 'alice@example.com' })
    .first();
  await expect(campaignSendRow).toContainText(campaignGroupName);
  await campaignSendRow.getByRole('button', { name: '이력 보기' }).click();
  const campaignSendDetail = page.locator('[data-testid^="send-events-"]', {
    hasText: '포함 경로',
  });
  await expect(campaignSendDetail).toContainText(
    `저장 그룹: ${campaignGroupName}`,
  );

  await page.getByTestId('send-recipient-search').fill(manualRecipient);
  await expect
    .poll(() => new URL(page.url()).searchParams.get('search'))
    .toBe(manualRecipient);
  await expect(manualSendRow).toBeVisible();
  await expect(campaignSendRow).toBeHidden();

  await page.reload();
  await expect(page.getByTestId('send-recipient-search')).toHaveValue(
    manualRecipient,
  );
  await expect(manualSendRow).toBeVisible();
  await expect(campaignSendRow).toBeHidden();

  await page.getByTestId('send-recipient-search').clear();
  await expect(campaignSendRow).toBeVisible();

  await page.getByTestId('send-provenance-filter-manual').click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('provenance'))
    .toBe('manual');
  await expect(manualSendRow).toBeVisible();
  await expect(campaignSendRow).toBeHidden();
  await expect(individualSendRow).toBeHidden();

  await page.getByTestId('send-provenance-filter-group').click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('provenance'))
    .toBe('group');
  await expect(campaignSendRow).toBeVisible();
  await expect(manualSendRow).toBeHidden();
  await expect(individualSendRow).toBeHidden();

  await page.goto(
    `/sends?search=${encodeURIComponent(campaignGroupName)}&provenance=group`,
  );
  await expect(page.getByTestId('send-recipient-search')).toHaveValue(
    campaignGroupName,
  );
  await expect(campaignSendRow).toBeVisible();
  await expect(manualSendRow).toBeHidden();
  await expect(individualSendRow).toBeHidden();

  await page.getByTestId('send-recipient-search').clear();
  await page.getByTestId('send-provenance-filter-all').click();
  await expect(campaignSendRow).toBeVisible();
  await expect(manualSendRow).toBeVisible();
  await expect(individualSendRow).toBeVisible();
});
