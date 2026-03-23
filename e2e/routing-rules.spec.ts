import { expect, test } from '@playwright/test';

test('creates routing nodes and rules, blocks missing fallback, and previews effective route', async ({
  page,
}) => {
  const suffix = Date.now().toString();
  const gmailNodeName = `smtp-gmail-${suffix}`;
  const defaultNodeName = `smtp-default-${suffix}`;
  const exactDomain = `gmail-${suffix}.example`;

  await page.goto('/routing');
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('이메일').fill('admin@supermailer.local');
  await page.getByLabel('비밀번호').fill('supermailer-admin');
  await page.getByRole('button', { name: '로그인' }).click();

  await expect(page).toHaveURL(/\/subscribers$/);
  await page.getByRole('button', { name: /Routing/ }).click();
  await expect(page).toHaveURL(/\/routing$/);

  await page.getByPlaceholder('이름 (예: main-node)').fill(gmailNodeName);
  await page
    .getByPlaceholder('호스트 (예: localhost)')
    .fill('gmail.relay.internal');
  await page.getByPlaceholder('포트').fill('2525');
  await page.getByPlaceholder('우선순위').fill('20');
  await page.getByRole('button', { name: '추가', exact: true }).click();
  await expect(page.getByTestId(`smtp-node-${gmailNodeName}`)).toBeVisible();
  await expect(
    page.getByRole('button', { name: '추가', exact: true }),
  ).toBeEnabled();

  await page.getByPlaceholder('이름 (예: main-node)').fill(defaultNodeName);
  await page
    .getByPlaceholder('호스트 (예: localhost)')
    .fill('default.relay.internal');
  await page.getByPlaceholder('포트').fill('2526');
  await page.getByPlaceholder('우선순위').fill('10');
  await page.getByRole('button', { name: '추가', exact: true }).click();
  await expect(page.getByTestId(`smtp-node-${defaultNodeName}`)).toBeVisible();

  await expect(page.getByTestId('smtp-node-list')).toContainText(gmailNodeName);
  await expect(page.getByTestId('smtp-node-list')).toContainText(
    defaultNodeName,
  );

  const removeButtons = page
    .getByTestId('routing-rules-list')
    .getByRole('button', { name: '삭제' });
  const existingRuleCount = await removeButtons.count();
  for (let index = 0; index < existingRuleCount; index += 1) {
    await removeButtons.first().click();
  }
  await expect(removeButtons).toHaveCount(0);

  await page.getByRole('button', { name: '+ 새 규칙 추가' }).click();
  const firstRule = page.getByTestId('routing-rule-0');
  await firstRule.locator('select').first().selectOption('exact');
  await firstRule.getByTestId('routing-domain-0').fill(exactDomain);
  await firstRule
    .getByTestId('routing-node-0')
    .selectOption({ label: gmailNodeName });
  await firstRule.getByTestId('routing-priority-0').fill('1');

  await page.getByRole('button', { name: '변경사항 저장' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'exactly one active default rule',
  );
  await expect(page.getByTestId('routing-default-rule-status')).toContainText(
    '활성 기본 규칙: 0개',
  );

  await page.getByRole('button', { name: '+ 새 규칙 추가' }).click();
  const secondRule = page.getByTestId('routing-rule-1');
  await secondRule.locator('select').first().selectOption('default');
  await secondRule
    .getByTestId('routing-node-1')
    .selectOption({ label: defaultNodeName });
  await secondRule.getByTestId('routing-priority-1').fill('100');

  await expect(page.getByTestId('routing-default-rule-status')).toContainText(
    '활성 기본 규칙: 1개',
  );
  await page.getByRole('button', { name: '변경사항 저장' }).click();
  await expect(page.getByText('규칙이 저장되었습니다.')).toBeVisible();
  await expect(page.getByText(/버전: \d+/)).toBeVisible();

  await page.getByTestId('route-preview-input').fill(`bob@${exactDomain}`);
  await page.getByRole('button', { name: '확인' }).click();
  await expect(page.getByTestId('route-preview-result')).toContainText(
    gmailNodeName,
  );
  await expect(page.getByTestId('route-preview-result')).toContainText(
    '규칙: exact',
  );

  await page.getByTestId('route-preview-input').fill('alice@example.com');
  await page.getByRole('button', { name: '확인' }).click();
  await expect(page.getByTestId('route-preview-result')).toContainText(
    defaultNodeName,
  );
  await expect(page.getByTestId('route-preview-result')).toContainText(
    '규칙: default',
  );
});
