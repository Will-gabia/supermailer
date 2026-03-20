import { describe, expect, it } from 'vitest';
import type { ManagementConsoleTestHarness } from './test-helpers';
import { registerIntegrationTestHarness } from './test-helpers';
import { createUlid } from '@supermailer/contracts';

describe('template snapshot', () => {
  let harness = {} as ManagementConsoleTestHarness;

  registerIntegrationTestHarness({
    setHarness: (value) => {
      harness = value;
    },
    getHarness: () => harness,
  });

  const loginAsAdmin = async (): Promise<string> => {
    const response = await harness.app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: harness.env.adminEmail,
        password: harness.env.adminPassword,
      }),
    });

    return response.headers.get('set-cookie') ?? '';
  };

  it('proves a queued send keeps the original snapshot after the template is edited later', async () => {
    // 1. Create a template
    const template = await harness.appContext.repositories.templates.create({
      id: createUlid(),
      name: `snap_test_${createUlid()}`,
      subject: 'Original Subject',
      html: 'Original HTML'
    });

    // 2. Enqueue a send using this template snapshot manually (to simulate the enqueue process for this test scope)
    const send = await harness.appContext.repositories.sends.create({
      id: createUlid(),
      kind: 'individual',
      recipientEmail: 'test@example.com',
      subjectSnapshot: template.subject, // the snapshot!
      htmlSnapshot: template.html,
      status: 'queued',
      templateId: template.id
    });

    // 3. Edit the template body via API
    const adminCookie = await loginAsAdmin();
    await harness.app.request(`/api/templates/${template.id}`, {
      method: 'PATCH',
      headers: {
        cookie: adminCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        subject: 'Edited Subject',
        html: 'Edited HTML',
      }),
    });

    // 4. Query the stored send snapshot
    const fetchedSend = await harness.appContext.repositories.sends.findById(send.id);

    // 5. Assert it has not changed
    expect(fetchedSend?.subjectSnapshot).toBe('Original Subject');
    expect(fetchedSend?.htmlSnapshot).toBe('Original HTML');

    // Also assert template changed
    const fetchedTemplate = await harness.appContext.repositories.templates.findById(template.id);
    expect(fetchedTemplate?.subject).toBe('Edited Subject');
    expect(fetchedTemplate?.html).toBe('Edited HTML');
  });
});
