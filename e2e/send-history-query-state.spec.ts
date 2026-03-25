import { expect, test } from '@playwright/test';

const createUniqueSuffix = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

test('send history preserves search and pagination query state with detail inspection', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('이메일').fill('admin@supermailer.local');
  await page.getByLabel('비밀번호').fill('supermailer-admin');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.waitForURL('/sends');

  const suffix = createUniqueSuffix();
  const apiKeyResponse = await page.request.post('/api/api-keys', {
    data: {
      label: `history-query-${suffix}`,
      scopes: ['individual-send'],
    },
  });
  expect(apiKeyResponse.status()).toBe(201);
  const apiKeyPayload = (await apiKeyResponse.json()) as {
    data: { rawKey: string };
  };

  for (const index of [1, 2, 3]) {
    const response = await page.request.post('/api/sends', {
      headers: {
        'x-api-key': apiKeyPayload.data.rawKey,
      },
      data: {
        eml: [
          'From: sender@example.com',
          `To: history-${suffix}-${index}@example.com`,
          `Subject: History ${suffix} ${index}`,
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset=utf-8',
          '',
          `History ${index}`,
        ].join('\r\n'),
      },
    });

    expect(response.status()).toBe(202);
  }

  await page.goto(`/sends?search=${suffix}&page=2`);

  await expect(page.getByTestId('send-recipient-search')).toHaveValue(suffix);
  await expect(page.getByTestId('send-history-page-current')).toContainText(
    '2',
  );
  await expect(page.getByTestId('send-history-page-prev')).toBeVisible();

  const pageList = page.locator('[data-testid="send-list"]');
  await expect(pageList).toContainText(`history-${suffix}-1@example.com`);

  await page.reload();
  await expect(page.getByTestId('send-recipient-search')).toHaveValue(suffix);
  await expect
    .poll(() => new URL(page.url()).searchParams.get('page'))
    .toBe('2');

  const sendRow = page.locator('tr', {
    hasText: `history-${suffix}-1@example.com`,
  });
  await sendRow.getByRole('button', { name: '이력 보기' }).click();
  await expect(page.locator('[data-testid^="send-events-"]')).toBeVisible();
});
