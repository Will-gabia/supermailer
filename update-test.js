const fs = require('fs');
let code = fs.readFileSync('e2e/reporting-events.spec.ts', 'utf8');

const assertionAddition = `  await expect(eventsPanel).toBeVisible();

  // Verify webhook panel shows up for this individual send
  const webhookPanel = page.locator(\`[data-testid^="send-webhook-"]\`);
  await expect(webhookPanel).toBeVisible();
  await expect(webhookPanel).toContainText('Outbound Webhook Status');
  await expect(webhookPanel).toContainText('http://localhost:4010/webhooks/result');
  await expect(webhookPanel.locator('[data-testid="webhook-status"]')).toBeVisible();`;

code = code.replace(/  await expect\(eventsPanel\)\.toBeVisible\(\);\n\}\);/, assertionAddition + '\n});');

fs.writeFileSync('e2e/reporting-events.spec.ts', code);
console.log('e2e test updated');
