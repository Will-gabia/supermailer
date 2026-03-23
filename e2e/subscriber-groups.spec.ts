import { expect, test } from '@playwright/test';

test('manages subscriber groups and assigns to subscribers', async ({
  page,
}) => {
  await page.goto('/subscribers');

  await page.getByLabel('이메일').fill('admin@supermailer.local');
  await page.getByLabel('비밀번호').fill('supermailer-admin');
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page).toHaveURL(/\/subscribers$/);

  // Create a new group
  const groupName = `테스트 그룹 ${Date.now()}`;
  await page.getByPlaceholder('새 그룹 이름').fill(groupName);
  await page.getByRole('button', { name: '그룹 추가' }).click();

  // Verify group is created
  const createdGroup = page
    .getByTestId(/subscriber-group-/)
    .filter({ hasText: groupName });
  await expect(createdGroup).toBeVisible();

  // Create a subscriber to assign to the group
  const testEmail = `test-${Date.now()}@example.com`;
  await page.getByTestId('subscriber-email-input').fill(testEmail);
  await page.getByTestId('subscriber-display-name-input').fill('Test User');
  await page.getByRole('button', { name: '추가하기' }).click();

  // Verify subscriber is in the list
  const subscriberRow = page.getByTestId(`subscriber-${testEmail}`);
  await expect(subscriberRow).toBeVisible();

  // Edit subscriber to assign group
  await subscriberRow.getByRole('button', { name: '정보 수정' }).click();
  await page.getByLabel(`${groupName} 그룹 선택`).check();
  await page.getByRole('button', { name: '수정 저장' }).click();

  // Verify group is shown in the list
  await expect(
    subscriberRow.locator('.badge-info', { hasText: groupName }),
  ).toBeVisible();

  // Test subscriber delete flow
  // Need to accept the confirmation dialog
  page.once('dialog', (dialog) => dialog.accept());
  await subscriberRow.getByRole('button', { name: '삭제' }).click();

  // Verify subscriber is removed
  await expect(subscriberRow).not.toBeVisible();

  // Clean up group
  const deleteGroupButton = createdGroup.getByRole('button', {
    name: `${groupName} 그룹 삭제`,
  });
  page.once('dialog', (dialog) => dialog.accept());
  await deleteGroupButton.click();
  await expect(deleteGroupButton).not.toBeVisible();
});
