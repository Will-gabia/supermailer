import sys

content = open('e2e/subscriber-groups.spec.ts').read()

content = content.replace("await page.getByPlaceholder('새 그룹 이름').fill(groupName);", "await page.getByPlaceholder('이름 입력').fill(groupName);")
content = content.replace("await page.getByRole('button', { name: '그룹 추가' }).click();", "await page.getByRole('button', { name: '추가' }).click();")
content = content.replace("const createdGroup = page\n    .getByTestId(/subscriber-group-/)\n    .filter({ hasText: groupName });", "const createdGroup = page\n    .getByTestId(/group-select-/)\n    .filter({ hasText: groupName });")

# group deletion logic
content = content.replace("""  // Clean up group
  const deleteGroupButton = createdGroup.getByRole('button', {
    name: `${groupName} 그룹 삭제`,
  });
  page.once('dialog', (dialog) => dialog.accept());
  await deleteGroupButton.click();
  await expect(deleteGroupButton).not.toBeVisible();""", """  // Clean up group
  await createdGroup.click();
  const deleteGroupButton = page.getByRole('button', {
    name: '그룹 삭제',
  });
  page.once('dialog', (dialog) => dialog.accept());
  await deleteGroupButton.click();
  await expect(createdGroup).not.toBeVisible();""")

with open('e2e/subscriber-groups.spec.ts', 'w') as f:
    f.write(content)
