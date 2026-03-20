import { expect, test } from '@playwright/test';

test('creates routing nodes and rules, blocks missing fallback, and previews effective route', async ({ page }) => {
  const suffix = Date.now().toString();
  const gmailNodeName = `smtp-gmail-${suffix}`;
  const defaultNodeName = `smtp-default-${suffix}`;
  const exactDomain = `gmail-${suffix}.example`;

  await page.goto('/routing');
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Email').fill('admin@supermailer.local');
  await page.getByLabel('Password').fill('supermailer-admin');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL(/\/subscribers$/);
  await page.getByRole('button', { name: 'Routing' }).click();
  await expect(page).toHaveURL(/\/routing$/);

  await page.locator('input[name="smtpNodeName"]').fill(gmailNodeName);
  await page.locator('input[name="smtpNodeHost"]').fill('gmail.relay.internal');
  await page.locator('input[name="smtpNodePort"]').fill('2525');
  await page.locator('input[name="smtpNodePriority"]').fill('20');
  await page.getByRole('button', { name: 'Add Node' }).click();
  await expect(page.getByTestId(`smtp-node-${gmailNodeName}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Node' })).toBeEnabled();

  await page.locator('input[name="smtpNodeName"]').fill(defaultNodeName);
  await page.locator('input[name="smtpNodeHost"]').fill('default.relay.internal');
  await page.locator('input[name="smtpNodePort"]').fill('2526');
  await page.locator('input[name="smtpNodePriority"]').fill('10');
  await page.getByRole('button', { name: 'Add Node' }).click();
  await expect(page.getByTestId(`smtp-node-${defaultNodeName}`)).toBeVisible();

  await expect(page.getByTestId('smtp-node-list')).toContainText(gmailNodeName);
  await expect(page.getByTestId('smtp-node-list')).toContainText(defaultNodeName);

  const removeButtons = page.getByTestId('routing-rules-list').getByRole('button', { name: 'Remove' });
  const existingRuleCount = await removeButtons.count();
  for (let index = 0; index < existingRuleCount; index += 1) {
    await removeButtons.first().click();
  }
  await expect(removeButtons).toHaveCount(0);

  await page.getByRole('button', { name: 'Add Rule' }).click();
  const firstRule = page.getByTestId('routing-rule-0');
  await firstRule.locator('select').first().selectOption('exact');
  await firstRule.getByTestId('routing-domain-0').fill(exactDomain);
  await firstRule.getByTestId('routing-node-0').selectOption({ label: gmailNodeName });
  await firstRule.getByTestId('routing-priority-0').fill('1');

  await page.getByRole('button', { name: 'Save Ruleset' }).click();
  await expect(page.getByRole('alert')).toContainText('exactly one active default rule');
  await expect(page.getByTestId('routing-default-rule-status')).toContainText('Active default fallback rules: 0');

  await page.getByRole('button', { name: 'Add Rule' }).click();
  const secondRule = page.getByTestId('routing-rule-1');
  await secondRule.locator('select').first().selectOption('default');
  await secondRule.getByTestId('routing-node-1').selectOption({ label: defaultNodeName });
  await secondRule.getByTestId('routing-priority-1').fill('100');

  await expect(page.getByTestId('routing-default-rule-status')).toContainText('Active default fallback rules: 1');
  await page.getByRole('button', { name: 'Save Ruleset' }).click();
  await expect(page.getByText('Rules saved successfully')).toBeVisible();
  await expect(page.getByText(/Current Version: \d+/)).toBeVisible();

  await page.getByTestId('route-preview-input').fill(`bob@${exactDomain}`);
  await page.getByRole('button', { name: 'Check Route' }).click();
  await expect(page.getByTestId('route-preview-result')).toContainText(gmailNodeName);
  await expect(page.getByTestId('route-preview-result')).toContainText('Rule: exact');
  await expect(page.getByTestId('route-preview-result')).toContainText(/Version: \d+/);

  await page.getByTestId('route-preview-input').fill('alice@example.com');
  await page.getByRole('button', { name: 'Check Route' }).click();
  await expect(page.getByTestId('route-preview-result')).toContainText(defaultNodeName);
  await expect(page.getByTestId('route-preview-result')).toContainText('Rule: default');
});
