const fs = require('fs');
let code = fs.readFileSync('apps/management-console/src/client/App.tsx', 'utf8');

// Add WebhookDeliveryRecord type
const typeAddition = `
type WebhookDeliveryRecord = {
  status: string;
  targetUrl: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
};
`;
code = code.replace(/type ReportingData = \{[\s\S]*?\};\n/, match => match + typeAddition);

// Add state
const stateAddition = `  const [sendEventsError, setSendEventsError] = useState<string | null>(null);
  const [sendWebhookDelivery, setSendWebhookDelivery] = useState<WebhookDeliveryRecord | null>(null);`;
code = code.replace(/const \[sendEventsError, setSendEventsError\] = useState<string \| null>\(null\);/, stateAddition);

// Update loadSendEvents
const loadSendEventsNew = `const loadSendEvents = async (sendId: string) => {
    setSelectedSendId(sendId);
    setSendEventsError(null);
    setSendEvents([]);
    setSendWebhookDelivery(null);
    try {
      const res = await loadJson<{ data: DeliveryEventRecord[], webhookDelivery: WebhookDeliveryRecord | null }>(\`/api/admin/sends/\${sendId}/delivery-events\`);
      setSendEvents(res.data);
      setSendWebhookDelivery(res.webhookDelivery);
    } catch (error) {
      setSendEventsError(error instanceof Error ? error.message : 'Failed to load send events');
    }
  };`;

code = code.replace(/const loadSendEvents = async \([\s\S]*? \};/, loadSendEventsNew);

// Update rendering
const eventsPanelNew = `<div data-testid={\`send-events-\${send.id}\`} style={{ marginTop: '0.5rem', padding: '1rem', border: '1px solid #ccc', backgroundColor: '#fafafa' }}>
                    <div style={{ display: 'flex', gap: '2rem' }}>
                      <div style={{ flex: 1 }}>
                        <h4>Event History</h4>
                        {sendEventsError ? <p role="alert">{sendEventsError}</p> : null}
                        {sendEvents.length === 0 && !sendEventsError ? <p>No events found for this send.</p> : (
                          <ul>
                            {sendEvents.map(event => (
                              <li key={event.id} data-testid={\`event-\${event.id}\`} style={{ fontSize: '0.9em', marginBottom: '0.5rem' }}>
                                <strong>{event.type}</strong> at {new Date(event.occurredAt).toLocaleString()}
                                {event.relay && <span> via {event.relay}</span>}
                                {event.smtpReplyCode && <span> (SMTP {event.smtpReplyCode} {event.smtpEnhancedCode})</span>}
                                {event.reason && <div><em>Reason:</em> {event.reason}</div>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      
                      {send.kind === 'individual' && (
                        <div style={{ flex: 1 }} data-testid={\`send-webhook-\${send.id}\`}>
                          <h4>Outbound Webhook Status</h4>
                          {!sendWebhookDelivery ? (
                            <p style={{ color: '#666', fontStyle: 'italic' }}>No webhook configured or recorded for this send.</p>
                          ) : (
                            <div style={{ fontSize: '0.9em' }}>
                              <div style={{ marginBottom: '0.5rem' }}><strong>Status:</strong> <span data-testid="webhook-status">{sendWebhookDelivery.status}</span></div>
                              <div style={{ marginBottom: '0.5rem' }}><strong>Target URL:</strong> {sendWebhookDelivery.targetUrl}</div>
                              <div style={{ marginBottom: '0.5rem' }}><strong>Attempts:</strong> {sendWebhookDelivery.attemptCount}</div>
                              {sendWebhookDelivery.lastAttemptAt && <div style={{ marginBottom: '0.5rem' }}><strong>Last Attempt:</strong> {new Date(sendWebhookDelivery.lastAttemptAt).toLocaleString()}</div>}
                              {sendWebhookDelivery.nextAttemptAt && <div style={{ marginBottom: '0.5rem' }}><strong>Next Attempt:</strong> {new Date(sendWebhookDelivery.nextAttemptAt).toLocaleString()}</div>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>`;

code = code.replace(/<div data-testid=\{`send-events-\${send\.id}`\}[\s\S]*?<\/div>\n                \)}/, eventsPanelNew + '\n                )}');

fs.writeFileSync('apps/management-console/src/client/App.tsx', code);
console.log('App.tsx patched');
