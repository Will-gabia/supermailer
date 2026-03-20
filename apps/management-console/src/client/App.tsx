import { useEffect, useMemo, useState } from 'react';

type SessionState =
  | { status: 'loading' }
  | { status: 'authenticated'; admin: { id: string; email: string } }
  | { status: 'unauthenticated' };

type SubscriberRecord = {
  id: string;
  email: string;
  displayName: string | null;
  status: string;
  sourceKey: string | null;
  externalId: string | null;
  isUnsubscribed: boolean;
  unsubscribedAt: string | null;
  lastSyncedAt: string | null;
  eligible: boolean;
  eligibilityReason: string | null;
  suppressionReasons: string[];
};

type SyncRunRecord = {
  id: string;
  sourceKey: string;
  status: string;
  errorSummary: string | null;
  startedAt: string;
  completedAt: string | null;
  stats: Record<string, number> | null;
  records: Array<{
    id: string;
    status: string;
    email: string | null;
    normalizedEmail: string | null;
    errorMessage: string | null;
  }>;
};


type TemplateRecord = {
  id: string;
  name: string;
  subject: string;
  html: string;
  variables: string[] | null;
};

type SendSmtpNodeRecord = {
  id: string;
  name: string;
  host: string;
  port: number;
  priority: number;
  isActive: boolean;
};

type RoutingRuleRecord = {
  id: string;
  version?: number;
  matchType: 'exact' | 'default';
  domain: string | null;
  sendSmtpNodeId: string;
  priority: number;
  isActive?: boolean;
};

type SendRecord = {
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
};

type WebhookDeliveryRecord = {
  status: string;
  targetUrl: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
};

const getPathname = (): string => window.location.pathname;

const navigate = (pathname: string): void => {
  window.history.pushState({}, '', pathname);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

const loadJson = async <T,>(input: RequestInfo | URL, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, {
    credentials: 'include',
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as T & { code?: string; message?: string };

  if (!response.ok) {
    throw new Error(payload.message ?? payload.code ?? 'Request failed');
  }

  return payload;
};

const parseNumberInput = (value: string, fallback: number): number => {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : fallback;
};

export const App = () => {
  const [pathname, setPathname] = useState(getPathname());
  const [session, setSession] = useState<SessionState>({ status: 'loading' });
  const [loginEmail, setLoginEmail] = useState('admin@supermailer.local');
  const [loginPassword, setLoginPassword] = useState('supermailer-admin');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);
  const [subscribers, setSubscribers] = useState<SubscriberRecord[]>([]);
  const [isLoadingSubscribers, setIsLoadingSubscribers] = useState(false);
  const [subscriberEmail, setSubscriberEmail] = useState('alice@example.com');
  const [subscriberDisplayName, setSubscriberDisplayName] = useState('Alice');
  const [subscriberFormError, setSubscriberFormError] = useState<string | null>(null);
  const [subscriberActionError, setSubscriberActionError] = useState<string | null>(null);
  const [syncSourceKey, setSyncSourceKey] = useState('crm');
  const [syncEndpointUrl, setSyncEndpointUrl] = useState('');
  const [syncRuns, setSyncRuns] = useState<SyncRunRecord[]>([]);
  const [isLoadingSyncRuns, setIsLoadingSyncRuns] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [apiKeyLabel, setApiKeyLabel] = useState('Playwright Key');
  const [apiKeyScopes, setApiKeyScopes] = useState<string[]>(['subscriber-sync']);
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [templateFormError, setTemplateFormError] = useState<string | null>(null);
  const [templateFormSuccess, setTemplateFormSuccess] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateHtml, setTemplateHtml] = useState('');
  const [previewDataStr, setPreviewDataStr] = useState('{\n  "firstName": "Alice",\n  "company": "Acme Corp"\n}');
  const [previewSubject, setPreviewSubject] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const [smtpNodes, setSmtpNodes] = useState<SendSmtpNodeRecord[]>([]);
  const [routingRules, setRoutingRules] = useState<RoutingRuleRecord[]>([]);
  const [routingRulesVersion, setRoutingRulesVersion] = useState<number | null>(null);
  
  
  const [nodeName, setNodeName] = useState('');
  const [nodeHost, setNodeHost] = useState('');
  const [nodePort, setNodePort] = useState('2525');
  const [nodePriority, setNodePriority] = useState('100');
  const [nodeFormError, setNodeFormError] = useState<string | null>(null);
  const [isCreatingNode, setIsCreatingNode] = useState(false);
  
  const [routingFormError, setRoutingFormError] = useState<string | null>(null);
  const [routingFormSuccess, setRoutingFormSuccess] = useState<string | null>(null);
  const [routingLoadError, setRoutingLoadError] = useState<string | null>(null);
  const [previewRecipientEmail, setPreviewRecipientEmail] = useState('');
  const [previewRouteResult, setPreviewRouteResult] = useState<{ rule: RoutingRuleRecord, node: SendSmtpNodeRecord } | null>(null);
  const [previewRouteError, setPreviewRouteError] = useState<string | null>(null);
  const [sends, setSends] = useState<SendRecord[]>([]);
  const [sendFlowError, setSendFlowError] = useState<string | null>(null);
  const [individualTo, setIndividualTo] = useState('alice@example.com');
  const [individualTemplateId, setIndividualTemplateId] = useState('');
  const [individualWebhookUrl, setIndividualWebhookUrl] = useState('http://localhost:4010/webhooks/result');
  const [campaignRecipients, setCampaignRecipients] = useState('bob@gmail.com\nhardbounce@example.com');
  const [campaignTemplateId, setCampaignTemplateId] = useState('');
  const [reportingData, setReportingData] = useState<ReportingData | null>(null);
  const [reportingLoadError, setReportingLoadError] = useState<string | null>(null);
  const [selectedSendId, setSelectedSendId] = useState<string | null>(null);
  const [sendEvents, setSendEvents] = useState<DeliveryEventRecord[]>([]);
    const [sendEventsError, setSendEventsError] = useState<string | null>(null);
  const [sendWebhookDelivery, setSendWebhookDelivery] = useState<WebhookDeliveryRecord | null>(null);

  useEffect(() => {
    const handlePopState = () => {
      setPathname(getPathname());
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const payload = await loadJson<
          { authenticated: true; admin: { id: string; email: string } } | { authenticated: false }
        >('/api/auth/session', {
          method: 'GET',
          headers: {},
        });

        if (payload.authenticated) {
          setSession({ status: 'authenticated', admin: payload.admin });
          return;
        }

        setSession({ status: 'unauthenticated' });
        if (pathname !== '/login') {
          navigate('/login');
        }
      } catch (error) {
        void error;
        setSession({ status: 'unauthenticated' });
        if (pathname !== '/login') {
          navigate('/login');
        }
      }
    };

    void loadSession();
  }, [pathname]);

  useEffect(() => {
    if (session.status !== 'authenticated' || pathname !== '/subscribers') {
      return;
    }

    const loadSubscribers = async () => {
      setIsLoadingSubscribers(true);

      try {
        const payload = await loadJson<{ data: SubscriberRecord[] }>('/api/subscribers', {
          method: 'GET',
          headers: {},
        });

        setSubscribers(payload.data);
      } finally {
        setIsLoadingSubscribers(false);
      }
    };

    void loadSubscribers();
  }, [pathname, session.status]);

  useEffect(() => {
    if (session.status !== 'authenticated' || pathname !== '/subscribers') {
      return;
    }

    const loadSyncRuns = async () => {
      setIsLoadingSyncRuns(true);

      try {
        const payload = await loadJson<{ data: SyncRunRecord[] }>('/api/sync-runs', {
          method: 'GET',
          headers: {},
        });

        setSyncRuns(payload.data);
      } finally {
        setIsLoadingSyncRuns(false);
      }
    };

    void loadSyncRuns();
  }, [pathname, session.status]);

  useEffect(() => {
    if (session.status !== 'authenticated' || pathname !== '/routing') {
      return;
    }

    const loadRouting = async () => {
      setRoutingLoadError(null);

      try {
        const [nodesRes, rulesRes] = await Promise.all([
          loadJson<{ data: SendSmtpNodeRecord[] }>('/api/send-smtp-nodes'),
          loadJson<{ data: RoutingRuleRecord[], version: number | null }>('/api/routing-rules')
        ]);
        setSmtpNodes(nodesRes.data);
        setRoutingRules(rulesRes.data);
        setRoutingRulesVersion(rulesRes.version);
      } catch (error) {
        setRoutingLoadError(error instanceof Error ? error.message : 'Failed to load routing configuration');
      }
    };
    void loadRouting();
  }, [pathname, session.status]);

  useEffect(() => {
    if (session.status !== 'authenticated' || pathname !== '/templates') {
      return;
    }

    const loadTemplates = async () => {
      setIsLoadingTemplates(true);
      try {
        const payload = await loadJson<{ data: TemplateRecord[] }>('/api/templates', {
          method: 'GET',
        });
        setTemplates(payload.data);
      } finally {
        setIsLoadingTemplates(false);
      }
    };

    void loadTemplates();
  }, [pathname, session.status]);

  useEffect(() => {
    if (session.status !== 'authenticated' || pathname !== '/sends') {
      return;
    }

    const loadSendFlowData = async () => {
      setSendFlowError(null);

      try {
        const [templatesRes, sendsRes] = await Promise.all([
          loadJson<{ data: TemplateRecord[] }>('/api/templates', { method: 'GET' }),
          loadJson<{ data: SendRecord[] }>('/api/sends', { method: 'GET' }),
        ]);

        setTemplates(templatesRes.data);
        setSends(sendsRes.data);
      } catch (error) {
        setSendFlowError(error instanceof Error ? error.message : 'Failed to load send flows');
      }
    };

    void loadSendFlowData();
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
  }, [pathname, session.status]);

  const title = useMemo(() => {
    if (pathname === '/login') {
      return 'Admin Login';
    }

    if (pathname === '/api-keys') {
      return 'External API Keys';
    }

    if (pathname === '/templates') {
      return 'Templates';
    }

    if (pathname === '/routing') {
      return 'Routing Rules';
    }

    if (pathname === '/sends') {
      return 'Send Flows';
    }

    if (pathname === '/reporting') {
      return 'Reporting';
    }

    return 'Subscribers';
  }, [pathname]);

  const toggleScope = (scope: string): void => {
    setApiKeyScopes((current) =>
      current.includes(scope) ? current.filter((value) => value !== scope) : [...current, scope],
    );
  };

  const submitLogin = async (): Promise<void> => {
    setIsSubmittingLogin(true);
    setLoginError(null);

    try {
      const payload = await loadJson<{ authenticated: true; admin: { id: string; email: string } }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });

      setSession({ status: 'authenticated', admin: payload.admin });
      navigate('/subscribers');
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  const logout = async (): Promise<void> => {
    await loadJson('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    }).catch((error: unknown) => {
      void error;
      return undefined;
    });

    setSession({ status: 'unauthenticated' });
    navigate('/login');
  };

  const createApiKey = async (): Promise<void> => {
    setApiKeyError(null);
    setCreatedApiKey(null);

    try {
      const payload = await loadJson<{ data: { rawKey: string } }>('/api/api-keys', {
        method: 'POST',
        body: JSON.stringify({
          label: apiKeyLabel,
          scopes: apiKeyScopes,
        }),
      });

      setCreatedApiKey(payload.data.rawKey);
    } catch (error) {
      setApiKeyError(error instanceof Error ? error.message : 'API key creation failed');
    }
  };

  const refreshSubscribers = async (): Promise<void> => {
    const payload = await loadJson<{ data: SubscriberRecord[] }>('/api/subscribers', {
      method: 'GET',
      headers: {},
    });

    setSubscribers(payload.data);
  };

  const refreshSyncRuns = async (): Promise<void> => {
    const payload = await loadJson<{ data: SyncRunRecord[] }>('/api/sync-runs', {
      method: 'GET',
      headers: {},
    });

    setSyncRuns(payload.data);
  };

  const createSubscriber = async (): Promise<void> => {
    setSubscriberFormError(null);

    try {
      await loadJson('/api/subscribers', {
        method: 'POST',
        body: JSON.stringify({
          email: subscriberEmail,
          displayName: subscriberDisplayName,
        }),
      });

      await refreshSubscribers();
      setSubscriberEmail('');
      setSubscriberDisplayName('');
    } catch (error) {
      setSubscriberFormError(error instanceof Error ? error.message : 'Subscriber creation failed');
    }
  };

  const toggleSubscriberUnsubscribed = async (subscriber: SubscriberRecord): Promise<void> => {
    setSubscriberActionError(null);

    try {
      await loadJson(`/api/subscribers/${subscriber.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          unsubscribed: !subscriber.isUnsubscribed,
        }),
      });

      await refreshSubscribers();
    } catch (error) {
      setSubscriberActionError(error instanceof Error ? error.message : 'Subscriber update failed');
    }
  };

  const addHardBounceSuppression = async (subscriber: SubscriberRecord): Promise<void> => {
    setSubscriberActionError(null);

    try {
      await loadJson(`/api/subscribers/${subscriber.id}/suppressions`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'hard_bounce' }),
      });

      await refreshSubscribers();
    } catch (error) {
      setSubscriberActionError(error instanceof Error ? error.message : 'Suppression creation failed');
    }
  };

  const runSync = async (): Promise<void> => {
    setSyncError(null);

    try {
      await loadJson('/api/admin/subscriber-sync-runs', {
        method: 'POST',
        body: JSON.stringify({
          sourceKey: syncSourceKey,
          endpointUrl: syncEndpointUrl,
        }),
      });

      await Promise.all([refreshSubscribers(), refreshSyncRuns()]);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Subscriber sync failed');
    }
  };

  const refreshTemplates = async (): Promise<void> => {
    const payload = await loadJson<{ data: TemplateRecord[] }>('/api/templates');
    setTemplates(payload.data);
  };

  const saveTemplate = async (): Promise<void> => {
    setTemplateFormError(null);
    setTemplateFormSuccess(null);
    
    try {
      if (editingTemplateId) {
        await loadJson(`/api/templates/${editingTemplateId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: templateName,
            subject: templateSubject,
            html: templateHtml,
          }),
        });
      } else {
        await loadJson('/api/templates', {
          method: 'POST',
          body: JSON.stringify({
            name: templateName,
            subject: templateSubject,
            html: templateHtml,
          }),
        });
      }
      
      setTemplateFormSuccess('Saved successfully');
      await refreshTemplates();
      
      if (!editingTemplateId) {
        setTemplateName('');
        setTemplateSubject('');
        setTemplateHtml('');
      }
    } catch (error) {
      setTemplateFormError(error instanceof Error ? error.message : 'Template save failed');
    }
  };
  
  const renderPreview = async (): Promise<void> => {
    setPreviewError(null);
    setIsPreviewing(true);
    
    try {
      let previewData = {};
      try {
        previewData = JSON.parse(previewDataStr);
      } catch (error) {
        void error;
        throw new Error('Preview data must be valid JSON');
      }
      
      const payload = await loadJson<{ data: { subject: string, html: string } }>('/api/templates/preview', {
        method: 'POST',
        body: JSON.stringify({
          subject: templateSubject,
          html: templateHtml,
          previewData,
        }),
      });
      
      setPreviewSubject(payload.data.subject);
      setPreviewHtml(payload.data.html);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Preview failed');
    } finally {
      setIsPreviewing(false);
    }
  };

  const createSmtpNode = async (): Promise<void> => {
    setNodeFormError(null);
    setIsCreatingNode(true);

    try {
      await loadJson('/api/send-smtp-nodes', {
        method: 'POST',
        body: JSON.stringify({
          name: nodeName,
          host: nodeHost,
          port: parseNumberInput(nodePort, 2525),
          priority: parseNumberInput(nodePriority, 100),
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
    } finally {
      setIsCreatingNode(false);
    }
  };

  const updateSmtpNode = async (nodeId: string, updates: Partial<Pick<SendSmtpNodeRecord, 'isActive'>>): Promise<void> => {
    setNodeFormError(null);

    try {
      await loadJson(`/api/send-smtp-nodes/${nodeId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });

      const nodesRes = await loadJson<{ data: SendSmtpNodeRecord[] }>('/api/send-smtp-nodes');
      setSmtpNodes(nodesRes.data);
    } catch (error) {
      setNodeFormError(error instanceof Error ? error.message : 'Failed to update node');
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
    setRoutingRules([
      ...routingRules,
      { id: `draft-${routingRules.length + 1}`, matchType: 'exact', domain: '', sendSmtpNodeId: '', priority: 100, isActive: true },
    ]);
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
    setPreviewRouteError(null);

    try {
      const res = await loadJson<{ data: { rule: RoutingRuleRecord, node: SendSmtpNodeRecord } | null }>('/api/routing-rules/preview', {
        method: 'POST',
        body: JSON.stringify({ recipientEmail: previewRecipientEmail }),
      });
      setPreviewRouteResult(res.data);
      if (!res.data) {
        setPreviewRouteError('No active routing rule could resolve this recipient');
      }
    } catch (error) {
      setPreviewRouteResult(null);
      setPreviewRouteError(error instanceof Error ? error.message : 'Failed to preview route');
    }
  };

  const activeDefaultRuleCount = routingRules.filter((rule) => rule.matchType === 'default' && (rule.isActive ?? true)).length;

  const loadSendEvents = async (sendId: string) => {
    setSelectedSendId(sendId);
    setSendEventsError(null);
    setSendEvents([]);
    setSendWebhookDelivery(null);
    try {
      const res = await loadJson<{ data: DeliveryEventRecord[], webhookDelivery: WebhookDeliveryRecord | null }>(`/api/admin/sends/${sendId}/delivery-events`);
      setSendEvents(res.data);
      setSendWebhookDelivery(res.webhookDelivery);
    } catch (error) {
      setSendEventsError(error instanceof Error ? error.message : 'Failed to load send events');
    }
  };

  if (session.status === 'loading') {
    return <main><p>Loading session…</p></main>;
  }

  if (session.status === 'unauthenticated' || pathname === '/login') {
    return (
      <main>
        <h1>{title}</h1>
        <form onSubmit={(event) => {
          event.preventDefault();
          void submitLogin();
        }}>
          <label>
            Email
            <input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} type="email" name="email" />
          </label>
          <label>
            Password
            <input value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} type="password" name="password" />
          </label>
          <button disabled={isSubmittingLogin} type="submit">
            {isSubmittingLogin ? 'Signing In…' : 'Sign In'}
          </button>
        </form>
        {loginError ? <p role="alert">{loginError}</p> : null}
      </main>
    );
  }

  return (
    <main>
      <header>
        <h1>{title}</h1>
        <p>Signed in as {session.admin.email}</p>
        <nav>
          <button onClick={() => navigate('/subscribers')} type="button">Subscribers</button>
          <button onClick={() => navigate('/api-keys')} type="button">API Keys</button>
          <button onClick={() => navigate('/templates')} type="button">Templates</button>
          <button onClick={() => navigate('/routing')} type="button">Routing</button>
          <button onClick={() => navigate('/sends')} type="button">Sends</button>
          <button onClick={() => navigate('/reporting')} type="button">Reporting</button>
          <button onClick={() => void logout()} type="button">Logout</button>
        </nav>
      </header>

      {pathname === '/api-keys' ? (
        <section>
          <h2>Create External API Key</h2>
          <form onSubmit={(event) => {
            event.preventDefault();
            void createApiKey();
          }}>
            <label>
              Label
              <input value={apiKeyLabel} onChange={(event) => setApiKeyLabel(event.target.value)} name="label" />
            </label>
            <fieldset>
              <legend>Scopes</legend>
              {['subscriber-sync', 'individual-send', 'campaign-send'].map((scope) => (
                <label key={scope}>
                  <input
                    checked={apiKeyScopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    type="checkbox"
                    name="scopes"
                    value={scope}
                  />
                  {scope}
                </label>
              ))}
            </fieldset>
            <button type="submit">Create API Key</button>
          </form>
          {createdApiKey ? <p data-testid="created-api-key">Raw key: {createdApiKey}</p> : null}
          {apiKeyError ? <p role="alert">{apiKeyError}</p> : null}
        </section>
      ) : pathname === '/templates' ? (
        <section>
          <h2>Templates</h2>
          
          <div style={{ display: 'flex', gap: '2rem' }}>
            <div style={{ flex: 1 }}>
              <h3>{editingTemplateId ? 'Edit Template' : 'Create Template'}</h3>
              <form onSubmit={(e) => { e.preventDefault(); void saveTemplate(); }}>
                <label style={{ display: 'block', marginBottom: '1rem' }}>
                  Name
                  <input 
                    value={templateName} 
                    onChange={(e) => setTemplateName(e.target.value)} 
                    name="templateName" 
                    disabled={!!editingTemplateId}
                    style={{ display: 'block', width: '100%' }}
                  />
                </label>
                <label style={{ display: 'block', marginBottom: '1rem' }}>
                  Subject
                  <input 
                    value={templateSubject} 
                    onChange={(e) => setTemplateSubject(e.target.value)} 
                    name="templateSubject"
                    style={{ display: 'block', width: '100%' }}
                  />
                </label>
                <label style={{ display: 'block', marginBottom: '1rem' }}>
                  HTML Content
                  <textarea 
                    value={templateHtml} 
                    onChange={(e) => setTemplateHtml(e.target.value)} 
                    name="templateHtml"
                    rows={10}
                    style={{ display: 'block', width: '100%', fontFamily: 'monospace' }}
                  />
                </label>
                <button type="submit">{editingTemplateId ? 'Update Template' : 'Create Template'}</button>
                {editingTemplateId && (
                  <button type="button" onClick={() => {
                    setEditingTemplateId(null);
                    setTemplateName('');
                    setTemplateSubject('');
                    setTemplateHtml('');
                    setTemplateFormSuccess(null);
                    setTemplateFormError(null);
                  }} style={{ marginLeft: '1rem' }}>Cancel Edit</button>
                )}
              </form>
              {templateFormError ? <p role="alert">{templateFormError}</p> : null}
              {templateFormSuccess ? <p data-testid="template-form-success" style={{ color: 'green' }}>{templateFormSuccess}</p> : null}

              <hr style={{ margin: '2rem 0' }} />

              <h3>Preview</h3>
              <label style={{ display: 'block', marginBottom: '1rem' }}>
                Preview Data (JSON)
                <textarea 
                  value={previewDataStr} 
                  onChange={(e) => setPreviewDataStr(e.target.value)} 
                  name="previewData"
                  rows={5}
                  style={{ display: 'block', width: '100%', fontFamily: 'monospace' }}
                />
              </label>
              <button onClick={() => void renderPreview()} disabled={isPreviewing}>Render Preview</button>
              {previewError ? <p role="alert">{previewError}</p> : null}
              
              {previewSubject !== null && previewHtml !== null && (
                <div style={{ marginTop: '1rem', border: '1px solid #ccc', padding: '1rem' }}>
                  <div data-testid="preview-subject" style={{ fontWeight: 'bold', marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>
                    Subject: {previewSubject}
                  </div>
                  <div data-testid="preview-html" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
              )}
            </div>

            <div style={{ flex: 1 }}>
              <h3>Template List</h3>
              {isLoadingTemplates ? <p>Loading templates…</p> : null}
              <ul>
                {templates.map((template) => (
                  <li key={template.id} data-testid={`template-${template.name}`} style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid #eee' }}>
                    <strong>{template.name}</strong>
                    <div>Variables: {template.variables?.length ? template.variables.join(', ') : 'none'}</div>
                    <button onClick={() => {
                      setEditingTemplateId(template.id);
                      setTemplateName(template.name);
                      setTemplateSubject(template.subject);
                      setTemplateHtml(template.html);
                      setTemplateFormSuccess(null);
                      setTemplateFormError(null);
                    }}>Edit / Preview</button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : pathname === '/routing' ? (
        <section>
          <h2>SendSMTP Nodes</h2>
          <form onSubmit={(e) => { e.preventDefault(); void createSmtpNode(); }}>
            <label>Name <input value={nodeName} onChange={e => setNodeName(e.target.value)} name="smtpNodeName" /></label>
            <label>Host <input value={nodeHost} onChange={e => setNodeHost(e.target.value)} name="smtpNodeHost" /></label>
            <label>Port <input type="number" value={nodePort} onChange={e => setNodePort(e.target.value)} name="smtpNodePort" /></label>
            <label>Priority <input type="number" value={nodePriority} onChange={e => setNodePriority(e.target.value)} name="smtpNodePriority" /></label>
            <button disabled={isCreatingNode} type="submit">{isCreatingNode ? 'Adding Node…' : 'Add Node'}</button>
          </form>
          {nodeFormError && <p role="alert">{nodeFormError}</p>}
          
          <ul data-testid="smtp-node-list">
            {smtpNodes.map(node => (
              <li key={node.id} data-testid={`smtp-node-${node.name}`}>
                <strong>{node.name}</strong> ({node.host}:{node.port}) - priority: {node.priority} - {node.isActive ? 'active' : 'inactive'}
                <button
                  type="button"
                  onClick={() => void updateSmtpNode(node.id, { isActive: !node.isActive })}
                  style={{ marginLeft: '0.75rem' }}
                >
                  Mark {node.isActive ? 'Inactive' : 'Active'}
                </button>
              </li>
            ))}
          </ul>

          <hr />

          <h2>Routing Rules</h2>
          <p>Current Version: {routingRulesVersion ?? 'None'}</p>
          {routingLoadError ? <p role="alert">{routingLoadError}</p> : null}
          <p data-testid="routing-default-rule-status">Active default fallback rules: {activeDefaultRuleCount}</p>
          
          {routingFormError && <p role="alert">{routingFormError}</p>}
          {routingFormSuccess && <p style={{ color: 'green' }}>{routingFormSuccess}</p>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }} data-testid="routing-rules-list">
            {routingRules.map((rule, idx) => (
              <div key={rule.id || idx} data-testid={`routing-rule-${idx}`} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', border: '1px solid #ccc', padding: '0.5rem' }}>
                <select value={rule.matchType} onChange={e => updateRule(idx, { matchType: e.target.value as 'exact' | 'default', domain: e.target.value === 'default' ? null : rule.domain, isActive: rule.isActive ?? true })}>
                  <option value="exact">Exact Domain</option>
                  <option value="default">Default Fallback</option>
                </select>
                
                {rule.matchType === 'exact' && (
                  <input data-testid={`routing-domain-${idx}`} placeholder="Domain" value={rule.domain ?? ''} onChange={e => updateRule(idx, { domain: e.target.value })} />
                )}
                
                <select data-testid={`routing-node-${idx}`} value={rule.sendSmtpNodeId} onChange={e => updateRule(idx, { sendSmtpNodeId: e.target.value })}>
                  <option value="">Select Node...</option>
                  {smtpNodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
                
                <input data-testid={`routing-priority-${idx}`} type="number" placeholder="Priority" value={rule.priority} onChange={e => updateRule(idx, { priority: parseNumberInput(e.target.value, rule.priority) })} />
                <label>
                  Active
                  <input
                    data-testid={`routing-active-${idx}`}
                    checked={rule.isActive ?? true}
                    onChange={e => updateRule(idx, { isActive: e.target.checked })}
                    type="checkbox"
                  />
                </label>
                
                <button type="button" onClick={() => removeRule(idx)}>Remove</button>
              </div>
            ))}
          </div>
          
          <button type="button" onClick={addRuleRow}>Add Rule</button>
          <button type="button" onClick={() => void saveRoutingRules()} style={{ marginLeft: '1rem' }}>Save Ruleset</button>

          <hr />

          <h2>Route Preview</h2>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <input data-testid="route-preview-input" value={previewRecipientEmail} onChange={e => setPreviewRecipientEmail(e.target.value)} placeholder="Recipient Email" />
            <button type="button" onClick={() => void previewRoute()}>Check Route</button>
          </div>
          {previewRouteError ? <p role="alert">{previewRouteError}</p> : null}
          {previewRouteResult && (
            <div data-testid="route-preview-result" style={{ marginTop: '1rem' }}>
              <strong>Resolved to:</strong> {previewRouteResult.node.name} (Rule: {previewRouteResult.rule.matchType}, Version: {previewRouteResult.rule.version ?? 'unknown'})
            </div>
          )}
        </section>
      ) : pathname === '/sends' ? (
        <section>
          <h2>Immediate Send Flows</h2>
          <div style={{ display: 'flex', gap: '2rem' }}>
            <div style={{ flex: 1 }}>
              <h3>Individual Send</h3>
              <form onSubmit={(event) => {
                event.preventDefault();
                void (async () => {
                  setSendFlowError(null);
                  try {
                    await loadJson('/api/admin/individual-sends', {
                      method: 'POST',
                      body: JSON.stringify({
                        to: individualTo,
                        templateId: individualTemplateId || undefined,
                        webhookUrl: individualWebhookUrl,
                        variables: { firstName: 'Alice' },
                      }),
                    });

                    const sendsRes = await loadJson<{ data: SendRecord[] }>('/api/sends', { method: 'GET' });
                    setSends(sendsRes.data);
                  } catch (error) {
                    setSendFlowError(error instanceof Error ? error.message : 'Individual send failed');
                  }
                })();
              }}>
                <label>
                  Recipient
                  <input data-testid="individual-send-to" value={individualTo} onChange={(event) => setIndividualTo(event.target.value)} />
                </label>
                <label>
                  Template
                  <select
                    data-testid="individual-send-template"
                    value={individualTemplateId}
                    onChange={(event) => setIndividualTemplateId(event.target.value)}
                  >
                    <option value="">Select template...</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>{template.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Webhook URL
                  <input data-testid="individual-send-webhook" value={individualWebhookUrl} onChange={(event) => setIndividualWebhookUrl(event.target.value)} />
                </label>
                <button type="submit">Send Individual Email</button>
              </form>
            </div>

            <div style={{ flex: 1 }}>
              <h3>Campaign Enqueue</h3>
              <form onSubmit={(event) => {
                event.preventDefault();
                void (async () => {
                  setSendFlowError(null);
                  try {
                    await loadJson('/api/admin/campaign-sends', {
                      method: 'POST',
                      body: JSON.stringify({
                        templateId: campaignTemplateId || undefined,
                        recipients: campaignRecipients
                          .split(/\s+/)
                          .map((value) => value.trim())
                          .filter((value) => value.length > 0),
                        variables: { firstName: 'Campaign' },
                      }),
                    });

                    const sendsRes = await loadJson<{ data: SendRecord[] }>('/api/sends', { method: 'GET' });
                    setSends(sendsRes.data);
                  } catch (error) {
                    setSendFlowError(error instanceof Error ? error.message : 'Campaign enqueue failed');
                  }
                })();
              }}>
                <label>
                  Template
                  <select data-testid="campaign-send-template" value={campaignTemplateId} onChange={(event) => setCampaignTemplateId(event.target.value)}>
                    <option value="">Select template...</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>{template.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Recipients (newline separated)
                  <textarea
                    data-testid="campaign-send-recipients"
                    rows={5}
                    value={campaignRecipients}
                    onChange={(event) => setCampaignRecipients(event.target.value)}
                  />
                </label>
                <button type="submit">Enqueue Campaign</button>
              </form>
            </div>
          </div>
          {sendFlowError ? <p role="alert">{sendFlowError}</p> : null}

          <h3>Queued Sends</h3>
          <ul data-testid="send-list">
            {sends.map((send) => (
              <li key={send.id} data-testid={`send-${send.id}`} style={{ marginBottom: '1rem' }}>
                <div>
                  <strong>{send.recipientEmail}</strong> ({send.kind}) — {send.status} — {send.queueJobId ?? 'not_queued'}
                  <button type="button" onClick={() => void loadSendEvents(send.id)} style={{ marginLeft: '1rem' }}>View History</button>
                </div>
                {selectedSendId === send.id && (
                  <div data-testid={`send-events-${send.id}`} style={{ marginTop: '0.5rem', padding: '1rem', border: '1px solid #ccc', backgroundColor: '#fafafa' }}>
                    <div style={{ display: 'flex', gap: '2rem' }}>
                      <div style={{ flex: 1 }}>
                        <h4>Event History</h4>
                        {sendEventsError ? <p role="alert">{sendEventsError}</p> : null}
                        {sendEvents.length === 0 && !sendEventsError ? <p>No events found for this send.</p> : (
                          <ul>
                            {sendEvents.map(event => (
                              <li key={event.id} data-testid={`event-${event.id}`} style={{ fontSize: '0.9em', marginBottom: '0.5rem' }}>
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
                        <div style={{ flex: 1 }} data-testid={`send-webhook-${send.id}`}>
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
                      <strong>{item.eventType}</strong>: {item.smtpReplyCode ?? 'N/A'} {item.smtpEnhancedCode ? `(${item.smtpEnhancedCode})` : ''} - {item.count} events
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
      ) : (
        <section>
          <h2>Subscriber Directory</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void createSubscriber();
            }}
          >
            <label>
              Subscriber Email
              <input
                data-testid="subscriber-email-input"
                value={subscriberEmail}
                onChange={(event) => setSubscriberEmail(event.target.value)}
                type="email"
                name="subscriberEmail"
              />
            </label>
            <label>
              Display Name
              <input
                data-testid="subscriber-display-name-input"
                value={subscriberDisplayName}
                onChange={(event) => setSubscriberDisplayName(event.target.value)}
                name="subscriberDisplayName"
              />
            </label>
            <button type="submit">Create Subscriber</button>
          </form>
          {subscriberFormError ? <p role="alert">{subscriberFormError}</p> : null}
          {isLoadingSubscribers ? <p>Loading subscribers…</p> : null}
          {subscriberActionError ? <p role="alert">{subscriberActionError}</p> : null}
          <ul data-testid="subscriber-list">
            {subscribers.map((subscriber) => (
              <li key={subscriber.id} data-testid={`subscriber-${subscriber.email}`}>
                <strong>{subscriber.email}</strong>
                {subscriber.displayName ? ` (${subscriber.displayName})` : ''}
                <div>Status: {subscriber.status}</div>
                <div>Eligibility: {subscriber.eligible ? 'eligible' : subscriber.eligibilityReason ?? 'ineligible'}</div>
                <div>Suppressions: {subscriber.suppressionReasons.length > 0 ? subscriber.suppressionReasons.join(', ') : 'none'}</div>
                <div>Last synced: {subscriber.lastSyncedAt ?? 'never'}</div>
                <button onClick={() => void toggleSubscriberUnsubscribed(subscriber)} type="button">
                  {subscriber.isUnsubscribed ? 'Resubscribe' : 'Unsubscribe'}
                </button>
                <button onClick={() => void addHardBounceSuppression(subscriber)} type="button">
                  Mark Hard Bounce
                </button>
              </li>
            ))}
          </ul>

          <section>
            <h2>Subscriber Sync</h2>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void runSync();
              }}
            >
              <label>
                Source Key
                <input value={syncSourceKey} onChange={(event) => setSyncSourceKey(event.target.value)} name="syncSourceKey" />
              </label>
              <label>
                Endpoint URL
                <input
                  data-testid="subscriber-sync-endpoint-input"
                  value={syncEndpointUrl}
                  onChange={(event) => setSyncEndpointUrl(event.target.value)}
                  name="syncEndpointUrl"
                />
              </label>
              <button type="submit">Run Subscriber Sync</button>
            </form>
            {syncError ? <p role="alert">{syncError}</p> : null}
            {isLoadingSyncRuns ? <p>Loading sync runs…</p> : null}
            <ul data-testid="sync-run-list">
              {syncRuns.map((syncRun) => (
                <li key={syncRun.id}>
                  <strong>{syncRun.sourceKey}</strong> — {syncRun.status}
                  <div>
                    processed {syncRun.stats?.processed ?? 0}, created {syncRun.stats?.created ?? 0}, updated {syncRun.stats?.updated ?? 0},
                    failed {syncRun.stats?.failed ?? 0}
                  </div>
                  {syncRun.errorSummary ? <div>Error: {syncRun.errorSummary}</div> : null}
                  <ul>
                    {syncRun.records.map((record) => (
                      <li key={record.id}>
                        {record.normalizedEmail ?? record.email ?? 'unknown'} — {record.status}
                        {record.errorMessage ? ` (${record.errorMessage})` : ''}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        </section>
      )}
    </main>
  );
};
