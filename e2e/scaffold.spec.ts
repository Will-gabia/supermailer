import { expect, test } from '@playwright/test';

test('playwright scaffold is wired', async () => {
  expect('supermailer').toContain('mail');
});
