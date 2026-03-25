import sys

content = """import { expect, test } from '@playwright/test';

test('restores subscriber group state from query string and reloads', async ({
  page,
}) => {
  await page.goto('/subscribers');
  await page.getByLabel('이메일').fill('admin@supermailer.local');
  await page.getByLabel('비밀번호').fill('supermailer-admin');
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page).toHaveURL(/\/subscribers$/);

  // Create a group for testing
  const groupName = `State Test ${Date.now()}`;
  await page.getByPlaceholder('이름 입력').fill(groupName);
  await page.getByRole('button', { name: '추가' }).click();

  const createdGroup = page
    .getByTestId(/group-select-/)
    .filter({ hasText: groupName });
  await expect(createdGroup).toBeVisible();

  // Click the group
  await createdGroup.click();
  
  // Wait for the URL to update with the group ID
  await expect
    .poll(() => new URL(page.url()).searchParams.get('group'))
    .toBeTruthy();

  const groupId = new URL(page.url()).searchParams.get('group');

  await page.reload();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('group'))
    .toBe(groupId);
  await expect(page.getByRole('heading', { name: groupName })).toBeVisible();

  await page.goto(`/subscribers?group=${groupId}`);
  await expect
    .poll(() => new URL(page.url()).searchParams.get('group'))
    .toBe(groupId);
  await expect(page.getByRole('heading', { name: groupName })).toBeVisible();

  await page.getByTestId('group-select-all').click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('group'))
    .toBe(null);

  // Cleanup
  await createdGroup.click();
  const deleteGroupButton = page.getByRole('button', { name: '그룹 삭제' });
  page.once('dialog', (dialog) => dialog.accept());
  await deleteGroupButton.click();
});
"""

with open('e2e/subscriber-query-state.spec.ts', 'w') as f:
    f.write(content)
