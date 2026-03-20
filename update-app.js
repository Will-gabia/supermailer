const fs = require('fs');
let code = fs.readFileSync('apps/management-console/src/client/App.tsx', 'utf8');

const typeReplacement = `type SendRecord = {
  id: string;
  kind: string;
  recipientEmail: string;
  status: string;
  queueJobId: string | null;
  createdAt: string;
};

type DeliveryEventRecord = {
  id: string;
  type: string;
  occurredAt: string;
  providerEventId: string;
  smtpReplyCode: string | null;
  smtpEnhancedCode: string | null;
  reason: string | null;
  relay: string | null;
  postfixQueueId: string | null;
  receivedAt: string;
};

type ReportingData = {
  statusCounts: Array<{ status: string; count: number }>;
  codeHistogram: Array<{ eventType: string; smtpReplyCode: string | null; smtpEnhancedCode: string | null; count: number }>;
  nodeBreakdown: Array<{ node: string; eventType: string; count: number }>;
};`;

code = code.replace(/type SendRecord = \{[\s\S]*?\};\n/, typeReplacement + '\n');

const stateReplacement = `const [campaignTemplateId, setCampaignTemplateId] = useState('');
  const [reportingData, setReportingData] = useState<ReportingData | null>(null);
  const [reportingLoadError, setReportingLoadError] = useState<string | null>(null);
  const [selectedSendId, setSelectedSendId] = useState<string | null>(null);
  const [sendEvents, setSendEvents] = useState<DeliveryEventRecord[]>([]);
  const [sendEventsError, setSendEventsError] = useState<string | null>(null);`;

code = code.replace(/const \[campaignTemplateId, setCampaignTemplateId\] = useState\(''\);/, stateReplacement);

const effectReplacement = `void loadSendFlowData();
  }, [pathname, session.status]);

  useEffect(() => {
    if (session.status !== 'authenticated' || pathname !== '/reporting') {
      return;
    }

    const loadReportingData = async () => {
      setReportingLoadError(null);
      try {
        const payload = await loadJson<{ data: ReportingData }>('/api/admin/reporting/delivery-events', { method: 'GET' });
        setReportingData(payload.data);
      } catch (error) {
        setReportingLoadError(error instanceof Error ? error.message : 'Failed to load reporting data');
      }
    };
    void loadReportingData();
  }, [pathname, session.status]);`;

code = code.replace(/void loadSendFlowData\(\);\n  \}, \[pathname, session\.status\]\);/, effectReplacement);

const titleReplacement = `if (pathname === '/sends') {
      return 'Send Flows';
    }

    if (pathname === '/reporting') {
      return 'Reporting';
    }`;

code = code.replace(/if \(pathname === '\/sends'\) \{\n      return 'Send Flows';\n    \}/, titleReplacement);

const loadEventsFn = `const activeDefaultRuleCount = routingRules.filter((rule) => rule.matchType === 'default' && (rule.isActive ?? true)).length;

  const loadSendEvents = async (sendId: string) => {
    setSelectedSendId(sendId);
    setSendEventsError(null);
    setSendEvents([]);
    try {
      const res = await loadJson<{ data: DeliveryEventRecord[] }>(\`/api/admin/sends/\${sendId}/delivery-events\`);
      setSendEvents(res.data);
    } catch (error) {
      setSendEventsError(error instanceof Error ? error.message : 'Failed to load send events');
    }
  };`;

code = code.replace(/const activeDefaultRuleCount = routingRules\.filter\(\(rule\) => rule\.matchType === 'default' && \(rule\.isActive \?\? true\)\)\.length;/, loadEventsFn);

const navReplacement = `<button onClick={() => navigate('/sends')} type="button">Sends</button>
          <button onClick={() => navigate('/reporting')} type="button">Reporting</button>`;

code = code.replace(/<button onClick=\{\(\) => navigate\('\/sends'\)\} type="button">Sends<\/button>/, navReplacement);

const sendsAndReportingBlock = `<h3>Queued Sends</h3>
          <ul data-testid="send-list">
            {sends.map((send) => (
              <li key={send.id} data-testid={\`send-\${send.id}\`} style={{ marginBottom: '1rem' }}>
                <div>
                  <strong>{send.recipientEmail}</strong> ({send.kind}) — {send.status} — {send.queueJobId ?? 'not_queued'}
                  <button type="button" onClick={() => void loadSendEvents(send.id)} style={{ marginLeft: '1rem' }}>View History</button>
                </div>
                {selectedSendId === send.id && (
                  <div data-testid={\`send-events-\${send.id}\`} style={{ marginTop: '0.5rem', padding: '1rem', border: '1px solid #ccc', backgroundColor: '#fafafa' }}>
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
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : pathname === '/reporting' ? (
        <section>
          <h2>Delivery Reporting</h2>
          {reportingLoadError ? <p role="alert">{reportingLoadError}</p> : null}
          {!reportingData && !reportingLoadError ? <p>Loading reporting data...</p> : reportingData && (
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 300px', padding: '1rem', border: '1px solid #ccc' }}>
                <h3>Status Breakdown</h3>
                <ul data-testid="reporting-status-counts">
                  {reportingData.statusCounts.length === 0 ? <li>No statuses recorded</li> : reportingData.statusCounts.map(count => (
                    <li key={count.status}>
                      <strong>{count.status}</strong>: {count.count}
                    </li>
                  ))}
                </ul>
              </div>
              
              <div style={{ flex: '1 1 300px', padding: '1rem', border: '1px solid #ccc' }}>
                <h3>SMTP Code Histogram</h3>
                <ul data-testid="reporting-code-histogram">
                  {reportingData.codeHistogram.length === 0 ? <li>No codes recorded</li> : reportingData.codeHistogram.map((item, idx) => (
                    <li key={idx}>
                      <strong>{item.eventType}</strong>: {item.smtpReplyCode ?? 'N/A'} {item.smtpEnhancedCode ? \`(\${item.smtpEnhancedCode})\` : ''} - {item.count} events
                    </li>
                  ))}
                </ul>
              </div>
              
              <div style={{ flex: '1 1 300px', padding: '1rem', border: '1px solid #ccc' }}>
                <h3>Node Performance</h3>
                <ul data-testid="reporting-node-breakdown">
                  {reportingData.nodeBreakdown.length === 0 ? <li>No node events recorded</li> : reportingData.nodeBreakdown.map((item, idx) => (
                    <li key={idx}>
                      <strong>{item.node}</strong> ({item.eventType}): {item.count}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>
      ) : (`;

code = code.replace(/<h3>Queued Sends<\/h3>[\s\S]*?<\/ul>\n        <\/section>\n      \) : \(/, sendsAndReportingBlock);

fs.writeFileSync('apps/management-console/src/client/App.tsx', code);
console.log('App.tsx updated successfully');
