import { expect, test } from '@playwright/test';
const createUniqueSuffix = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

test.describe('template management', () => {
  test('supports creating, listing, and previewing templates with variables', async ({
    page,
  }) => {
    // 1. Log in
    await page.goto('/login');
    await page.getByLabel('이메일').fill('admin@supermailer.local');
    await page.getByLabel('비밀번호').fill('supermailer-admin');
    await page.getByRole('button', { name: '로그인' }).click();

    // Wait for auth to complete
    await page.waitForURL('/subscribers');

    // 2. Navigate to Templates
    await page.getByRole('button', { name: /템플릿 관리/ }).click();
    await page.waitForURL('/templates');

    // 3. Create a template
    const templateName = `test_template_${createUniqueSuffix()}`;
    const createTemplateResponse = await page.request.post('/api/templates', {
      data: {
        name: templateName,
        subject: 'Hello {{firstName}}',
        html: '<p>Welcome to {{company}}, {{firstName}}!</p>',
      },
    });
    expect(createTemplateResponse.ok()).toBeTruthy();
    await page.reload();
    await page.waitForURL('/templates');

    // 4. Verify template is in list
    const templateRow = page.locator(
      `li[data-testid="template-${templateName}"]`,
    );
    await expect(templateRow).toBeVisible({ timeout: 15000 });
    await expect(templateRow).toContainText('firstName');
    await expect(templateRow).toContainText('company');

    // 5. Open template for preview
    await templateRow.locator('button:has-text("수정")').click();

    // 6. Enter preview data and render
    await page
      .getByLabel('미리보기 데이터 (JSON)')
      .fill('{"firstName": "Alice", "company": "Acme Corp"}');
    await page.getByRole('button', { name: '미리보기 렌더링' }).click();

    // 7. Verify preview output
    await expect(page.locator('[data-testid="preview-subject"]')).toContainText(
      'Hello Alice',
    );
    await expect(page.locator('[data-testid="preview-html"]')).toContainText(
      'Welcome to Acme Corp, Alice!',
    );

    // 8. Edit the template and save
    await page.getByLabel('제목').fill('Hi {{firstName}}!');
    await page.getByRole('button', { name: '수정하기' }).click();
    await expect(
      page.locator('[data-testid="template-form-success"]'),
    ).toContainText('저장되었습니다.');
  });
});
