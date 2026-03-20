const fs = require('fs');
const content = fs.readFileSync('apps/management-console/src/client/App.tsx', 'utf-8');

let newContent = content.replace(
  `  variables: string[] | null;
};`,
  `  variables: string[] | null;
};

type SendSmtpNodeRecord = {
  id: string;
  name: string;
  host: string;
  port: number;
  priority: number;
};

type RoutingRuleRecord = {
  id: string;
  matchType: 'exact' | 'default';
  domain: string | null;
  sendSmtpNodeId: string;
  priority: number;
};`
);

newContent = newContent.replace(
  `  const [isPreviewing, setIsPreviewing] = useState(false);`,
  `  const [isPreviewing, setIsPreviewing] = useState(false);

  const [smtpNodes, setSmtpNodes] = useState<SendSmtpNodeRecord[]>([]);
  const [routingRules, setRoutingRules] = useState<RoutingRuleRecord[]>([]);
  const [routingRulesVersion, setRoutingRulesVersion] = useState<number | null>(null);
  const [isLoadingRouting, setIsLoadingRouting] = useState(false);
  
  const [nodeName, setNodeName] = useState('');
  const [nodeHost, setNodeHost] = useState('');
  const [nodePort, setNodePort] = useState('2525');
  const [nodePriority, setNodePriority] = useState('100');
  const [nodeFormError, setNodeFormError] = useState<string | null>(null);
  
  const [routingFormError, setRoutingFormError] = useState<string | null>(null);
  const [routingFormSuccess, setRoutingFormSuccess] = useState<string | null>(null);
  const [previewRecipientEmail, setPreviewRecipientEmail] = useState('');
  const [previewRouteResult, setPreviewRouteResult] = useState<{ rule: RoutingRuleRecord, node: SendSmtpNodeRecord } | null>(null);`
);

newContent = newContent.replace(
  `  useEffect(() => {
    if (session.status !== 'authenticated' || pathname !== '/templates') {`,
  `  useEffect(() => {
    if (session.status !== 'authenticated' || pathname !== '/routing') {
      return;
    }

    const loadRouting = async () => {
      setIsLoadingRouting(true);
      try {
        const [nodesRes, rulesRes] = await Promise.all([
          loadJson<{ data: SendSmtpNodeRecord[] }>('/api/send-smtp-nodes'),
          loadJson<{ data: RoutingRuleRecord[], version: number | null }>('/api/routing-rules')
        ]);
        setSmtpNodes(nodesRes.data);
        setRoutingRules(rulesRes.data);
        setRoutingRulesVersion(rulesRes.version);
      } finally {
        setIsLoadingRouting(false);
      }
    };
    void loadRouting();
  }, [pathname, session.status]);

  useEffect(() => {
    if (session.status !== 'authenticated' || pathname !== '/templates') {`
);

newContent = newContent.replace(
  `    if (pathname === '/templates') {
      return 'Templates';
    }

    return 'Subscribers';`,
  `    if (pathname === '/templates') {
      return 'Templates';
    }

    if (pathname === '/routing') {
      return 'Routing Rules';
    }

    return 'Subscribers';`
);

newContent = newContent.replace(
  `      setIsPreviewing(false);
    }
  };`,
  `      setIsPreviewing(false);
    }
  };

  const createSmtpNode = async (): Promise<void> => {
    setNodeFormError(null);
    try {
      await loadJson('/api/send-smtp-nodes', {
        method: 'POST',
        body: JSON.stringify({
          name: nodeName,
          host: nodeHost,
          port: parseInt(nodePort, 10),
          priority: parseInt(nodePriority, 10),
        }),
      });
      const nodesRes = await loadJson<{ data: SendSmtpNodeRecord[] }>('/api/send-smtp-nodes');
      setSmtpNodes(nodesRes.data);
      setNodeName('');
      setNodeHost('');
      setNodePort('2525');
      setNodePriority('100');
    } catch (error) {
      setNodeFormError(error instanceof Error ? error.message : 'Failed to create node');
    }
  };

  const saveRoutingRules = async (): Promise<void> => {
    setRoutingFormError(null);
    setRoutingFormSuccess(null);
    try {
      await loadJson('/api/routing-rules', {
        method: 'POST',
        body: JSON.stringify({ rules: routingRules }),
      });
      const rulesRes = await loadJson<{ data: RoutingRuleRecord[], version: number | null }>('/api/routing-rules');
      setRoutingRules(rulesRes.data);
      setRoutingRulesVersion(rulesRes.version);
      setRoutingFormSuccess('Rules saved successfully');
    } catch (error) {
      setRoutingFormError(error instanceof Error ? error.message : 'Failed to save routing rules');
    }
  };

  const addRuleRow = () => {
    setRoutingRules([...routingRules, { id: '', matchType: 'exact', domain: '', sendSmtpNodeId: '', priority: 100 }]);
  };

  const updateRule = (index: number, updates: Partial<RoutingRuleRecord>) => {
    const newRules = [...routingRules];
    newRules[index] = { ...newRules[index], ...updates };
    setRoutingRules(newRules);
  };

  const removeRule = (index: number) => {
    setRoutingRules(routingRules.filter((_, i) => i !== index));
  };

  const previewRoute = async () => {
    try {
      const res = await loadJson<{ data: { rule: RoutingRuleRecord, node: SendSmtpNodeRecord } | null }>('/api/routing-rules/preview', {
        method: 'POST',
        body: JSON.stringify({ recipientEmail: previewRecipientEmail }),
      });
      setPreviewRouteResult(res.data);
    } catch {
    }
  };`
);

newContent = newContent.replace(
  `          <button onClick={() => navigate('/templates')} type="button">Templates</button>
          <button onClick={() => void logout()} type="button">Logout</button>`,
  `          <button onClick={() => navigate('/templates')} type="button">Templates</button>
          <button onClick={() => navigate('/routing')} type="button">Routing</button>
          <button onClick={() => void logout()} type="button">Logout</button>`
);

newContent = newContent.replace(
  `      ) : (
        <section>
          <h2>Subscriber Directory</h2>`,
  `      ) : pathname === '/routing' ? (
        <section>
          <h2>SendSMTP Nodes</h2>
          <form onSubmit={(e) => { e.preventDefault(); void createSmtpNode(); }}>
            <label>Name <input value={nodeName} onChange={e => setNodeName(e.target.value)} name="nodeName" /></label>
            <label>Host <input value={nodeHost} onChange={e => setNodeHost(e.target.value)} name="nodeHost" /></label>
            <label>Port <input type="number" value={nodePort} onChange={e => setNodePort(e.target.value)} name="nodePort" /></label>
            <label>Priority <input type="number" value={nodePriority} onChange={e => setNodePriority(e.target.value)} name="nodePriority" /></label>
            <button type="submit">Add Node</button>
          </form>
          {nodeFormError && <p role="alert">{nodeFormError}</p>}
          
          <ul data-testid="smtp-node-list">
            {smtpNodes.map(node => (
              <li key={node.id}><strong>{node.name}</strong> ({node.host}:{node.port}) - priority: {node.priority}</li>
            ))}
          </ul>

          <hr />

          <h2>Routing Rules</h2>
          <p>Current Version: {routingRulesVersion ?? 'None'}</p>
          
          {routingFormError && <p role="alert">{routingFormError}</p>}
          {routingFormSuccess && <p style={{ color: 'green' }}>{routingFormSuccess}</p>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }} data-testid="routing-rules-list">
            {routingRules.map((rule, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', border: '1px solid #ccc', padding: '0.5rem' }}>
                <select value={rule.matchType} onChange={e => updateRule(idx, { matchType: e.target.value as 'exact' | 'default', domain: e.target.value === 'default' ? null : rule.domain })}>
                  <option value="exact">Exact Domain</option>
                  <option value="default">Default Fallback</option>
                </select>
                
                {rule.matchType === 'exact' && (
                  <input placeholder="Domain" value={rule.domain ?? ''} onChange={e => updateRule(idx, { domain: e.target.value })} />
                )}
                
                <select value={rule.sendSmtpNodeId} onChange={e => updateRule(idx, { sendSmtpNodeId: e.target.value })}>
                  <option value="">Select Node...</option>
                  {smtpNodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
                
                <input type="number" placeholder="Priority" value={rule.priority} onChange={e => updateRule(idx, { priority: parseInt(e.target.value, 10) })} />
                
                <button type="button" onClick={() => removeRule(idx)}>Remove</button>
              </div>
            ))}
          </div>
          
          <button type="button" onClick={addRuleRow}>Add Rule</button>
          <button type="button" onClick={() => void saveRoutingRules()} style={{ marginLeft: '1rem' }}>Save Ruleset</button>

          <hr />

          <h2>Route Preview</h2>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <input value={previewRecipientEmail} onChange={e => setPreviewRecipientEmail(e.target.value)} placeholder="Recipient Email" />
            <button type="button" onClick={() => void previewRoute()}>Check Route</button>
          </div>
          {previewRouteResult && (
            <div data-testid="route-preview-result" style={{ marginTop: '1rem' }}>
              <strong>Resolved to:</strong> {previewRouteResult.node.name} (Rule: {previewRouteResult.rule.matchType})
            </div>
          )}
        </section>
      ) : (
        <section>
          <h2>Subscriber Directory</h2>`
);

fs.writeFileSync('apps/management-console/src/client/App.tsx', newContent);
