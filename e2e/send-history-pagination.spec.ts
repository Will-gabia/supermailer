import { expect, test } from '@playwright/test';

const createUniqueSuffix = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

test('send history paginates and no longer exposes manual send controls', async ({
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
      label: `history-pagination-${suffix}`,
      scopes: ['individual-send'],
    },
  });
  expect(apiKeyResponse.status()).toBe(201);
  const apiKeyPayload = (await apiKeyResponse.json()) as {
    data: { rawKey: string };
  };

  for (const index of Array.from({ length: 22 }, (_, i) => i + 1)) {
    const response = await page.request.post('/api/sends', {
      headers: {
        'x-api-key': apiKeyPayload.data.rawKey,
      },
      data: {
        eml: [
          'From: sender@example.com',
          `To: history-page-${suffix}-${index}@example.com`,
          `Subject: History Page ${suffix} ${index}`,
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset=utf-8',
          '',
          `History Page ${index}`,
        ].join('\r\n'),
      },
    });

    expect(response.status()).toBe(202);
  }

  await page.goto(`/sends?search=${suffix}`);

  await expect(page.getByTestId('send-history-page-current')).toContainText(
    '1',
  );
  await expect(page.getByTestId('send-history-page-next')).toBeEnabled();
  await expect(page.getByTestId('send-list')).toContainText(
    `history-page-${suffix}-22@example.com`,
  );

  await page.getByTestId('send-history-page-next').click();
  await expect(page.getByTestId('send-history-page-current')).toContainText(
    '2',
  );
  await expect
    .poll(() => new URL(page.url()).searchParams.get('page'))
    .toBe('2');
  await expect(page.getByTestId('send-list')).toContainText(
    `history-page-${suffix}-2@example.com`,
  );

  await page.getByTestId('send-history-page-prev').click();
  await expect(page.getByTestId('send-history-page-current')).toContainText(
    '1',
  );

  await expect(page.getByTestId('individual-send-to')).toHaveCount(0);
  await expect(page.getByTestId('individual-send-subject')).toHaveCount(0);
  await expect(page.getByText('개별 발송하기')).toHaveCount(0);
});
