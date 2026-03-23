import { expect, test } from '@playwright/test';

test('admin login protects routes and grants subscriber access', async ({
  page,
  context,
}) => {
  await page.goto('/subscribers');
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('이메일').fill('admin@supermailer.local');
  await page.getByLabel('비밀번호').fill('supermailer-admin');
  await page.getByRole('button', { name: '로그인' }).click();

  await expect(page).toHaveURL(/\/subscribers$/);
  await expect(
    page.getByRole('heading', { name: '구독자 관리' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '신규 구독자 추가' }),
  ).toBeVisible();

  const cookies = await context.cookies();
  const sessionCookie = cookies.find(
    (cookie) => cookie.name === 'supermailer_admin_session',
  );
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(sessionCookie?.secure).toBe(true);
});
