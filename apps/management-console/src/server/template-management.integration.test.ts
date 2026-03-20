import { describe, expect, it } from 'vitest';
import type { ManagementConsoleTestHarness } from './test-helpers';
import { registerIntegrationTestHarness } from './test-helpers';

describe('template management', () => {
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

  it('supports create, update, list, and preview', async () => {
    const adminCookie = await loginAsAdmin();

    // Create
    const createResponse = await harness.app.request('/api/templates', {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'welcome_v1',
        subject: 'Welcome {{firstName}}',
        html: '<p>Hi {{firstName}}, welcome to {{company}}!</p>',
      }),
    });

    expect(createResponse.status).toBe(201);
    const createdPayload = (await createResponse.json()) as { data: { id: string, name: string, variables: string[] } };
    expect(createdPayload.data.name).toBe('welcome_v1');
    expect(createdPayload.data.variables).toEqual(['firstName', 'company']);

    const templateId = createdPayload.data.id;

    // Update
    const updateResponse = await harness.app.request(`/api/templates/${templateId}`, {
      method: 'PATCH',
      headers: {
        cookie: adminCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        subject: 'Welcome to {{company}}, {{firstName}}!',
      }),
    });
    expect(updateResponse.status).toBe(200);

    // List
    const listResponse = await harness.app.request('/api/templates', {
      headers: {
        cookie: adminCookie,
      },
    });
    expect(listResponse.status).toBe(200);
    const listPayload = (await listResponse.json()) as { data: { id: string }[] };
    expect(listPayload.data.some((t) => t.id === templateId)).toBe(true);

    // Preview
    const previewResponse = await harness.app.request('/api/templates/preview', {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        subject: 'Hello {{firstName}}',
        html: '<p>Hi {{firstName}}</p>',
        previewData: { firstName: 'Alice' }
      }),
    });
    expect(previewResponse.status).toBe(200);
    const previewPayload = (await previewResponse.json()) as { data: { subject: string, html: string } };
    expect(previewPayload.data.subject).toBe('Hello Alice');
    expect(previewPayload.data.html).toBe('<p>Hi Alice</p>');
  });
});
