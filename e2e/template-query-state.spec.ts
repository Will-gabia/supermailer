import { expect, test } from '@playwright/test';

const createUniqueSuffix = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

test('restores selected template edit state from query string and reloads', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('이메일').fill('admin@supermailer.local');
  await page.getByLabel('비밀번호').fill('supermailer-admin');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.waitForURL('/subscribers');

  await page.getByRole('button', { name: /템플릿 관리/ }).click();
  await page.waitForURL('/templates');

  const templateName = `query_template_${createUniqueSuffix()}`;
  const createTemplateResponse = await page.request.post('/api/templates', {
    data: {
      name: templateName,
      subject: 'Query Subject',
      html: '<p>Query Body</p>',
    },
  });
  expect(createTemplateResponse.ok()).toBeTruthy();
  await page.reload();
  await page.waitForURL('/templates');

  const templateRow = page.getByTestId(`template-${templateName}`);
  await expect(templateRow).toBeVisible({ timeout: 15000 });
  await templateRow.getByRole('button', { name: '수정' }).click();

  await expect
    .poll(() => new URL(page.url()).searchParams.get('template'))
    .not.toBeNull();
  const selectedTemplateId = new URL(page.url()).searchParams.get('template');

  await expect(page.getByLabel('식별자 이름')).toHaveValue(templateName);
  await expect(page.getByLabel('제목')).toHaveValue('Query Subject');

  await page.reload();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('template'))
    .toBe(selectedTemplateId);
  await expect(page.getByLabel('식별자 이름')).toHaveValue(templateName);
  await expect(page.getByLabel('제목')).toHaveValue('Query Subject');

  await page.goto(`/templates?template=${selectedTemplateId}`);
  await expect(page.getByLabel('식별자 이름')).toHaveValue(templateName);
  await expect(page.getByLabel('제목')).toHaveValue('Query Subject');

  await page.getByRole('button', { name: '취소' }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('template'))
    .toBe(null);
});
