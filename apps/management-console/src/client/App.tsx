import React, { useEffect, useState } from 'react';

import {
  buildApiKeyViewSearch,
  parseApiKeyViewFromSearch,
} from './apiKeyViewQuery';
import {
  buildSendFiltersSearch,
  parseSendFiltersFromSearch,
  type SendProvenanceFilter,
} from './sendFiltersQuery';
import {
  buildRoutingViewSearch,
  parseRoutingViewFromSearch,
  type RoutingSection,
} from './routingViewQuery';
import {
  buildReportingViewSearch,
  parseReportingViewFromSearch,
  type ReportingSection,
} from './reportingViewQuery';
import { filterSends } from './sendsFiltering';

// === Types ===
type SessionState =
  | { status: 'loading' }
  | { status: 'authenticated'; admin: { id: string; email: string } }
  | { status: 'unauthenticated' };

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
  failoverNodeIds: string[];
  priority: number;
  isActive?: boolean;
};
type RoutingPreviewResult = {
  rule: RoutingRuleRecord;
  node: SendSmtpNodeRecord;
  nodes: SendSmtpNodeRecord[];
};
type SendRecord = {
  id: string;
  kind: string;
  recipientEmail: string;
  status: string;
  queueJobId: string | null;
  createdAt: string;
};
type SendHistoryPageInfo = {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
  page: number;
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
  codeHistogram: Array<{
    eventType: string;
    smtpReplyCode: string | null;
    smtpEnhancedCode: string | null;
    count: number;
  }>;
  nodeBreakdown: Array<{ node: string; eventType: string; count: number }>;
};
type WebhookDeliveryRecord = {
  status: string;
  targetUrl: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
};
type ApiKeyRecord = {
  id: string;
  label: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

// === Helpers ===
const getPathname = (): string => window.location.pathname;
const getSearch = (): string => window.location.search;
const navigate = (pathname: string, search = ''): void => {
  const nextLocation = `${pathname}${search}`;
  const currentLocation = `${window.location.pathname}${window.location.search}`;

  if (nextLocation === currentLocation) {
    return;
  }

  window.history.pushState({}, '', nextLocation);
  window.dispatchEvent(new PopStateEvent('popstate'));
};
const loadJson = async <T,>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(input, {
    cache: 'no-store',
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    code?: string;
    message?: string;
  };
  if (!response.ok)
    throw new Error(payload.message ?? payload.code ?? 'Request failed');
  return payload;
};
const parseNumberInput = (value: string, fallback: number): number => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const SEND_HISTORY_PAGE_SIZE = 20;

// === Main App ===
export const App = () => {
  const [pathname, setPathname] = useState(getPathname());
  const [locationSearch, setLocationSearch] = useState(getSearch());
  const [session, setSession] = useState<SessionState>({ status: 'loading' });

  // Login State
  const [loginEmail, setLoginEmail] = useState('admin@supermailer.local');
  const [loginPassword, setLoginPassword] = useState('supermailer-admin');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);

  // API Key State
  const [apiKeyLabel, setApiKeyLabel] = useState('Playwright Key');
  const initialApiKeyViewState = parseApiKeyViewFromSearch(getSearch());
  const [apiKeyScopes, setApiKeyScopes] = useState<string[]>(
    initialApiKeyViewState.scopes,
  );
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [isLoadingApiKeys, setIsLoadingApiKeys] = useState(false);
  const [revokingApiKeyId, setRevokingApiKeyId] = useState<string | null>(null);
  const [deletingApiKeyId, setDeletingApiKeyId] = useState<string | null>(null);

  // Routing State
  const [smtpNodes, setSmtpNodes] = useState<SendSmtpNodeRecord[]>([]);
  const [routingRules, setRoutingRules] = useState<RoutingRuleRecord[]>([]);
  const [routingRulesVersion, setRoutingRulesVersion] = useState<number | null>(
    null,
  );
  const initialRoutingViewState = parseRoutingViewFromSearch(getSearch());
  const [routingSection, setRoutingSection] = useState<RoutingSection>(
    initialRoutingViewState.section,
  );
  const [nodeName, setNodeName] = useState('');
  const [nodeHost, setNodeHost] = useState('');
  const [nodePort, setNodePort] = useState('2525');
  const [nodePriority, setNodePriority] = useState('100');
  const [nodeFormError, setNodeFormError] = useState<string | null>(null);
  const [isCreatingNode, setIsCreatingNode] = useState(false);
  const [testingNodeId, setTestingNodeId] = useState<string | null>(null);
  const [deletingNodeId, setDeletingNodeId] = useState<string | null>(null);
  const [nodeTestResults, setNodeTestResults] = useState<
    Record<string, { ok: boolean; error: string | null }>
  >({});
  const [nodeActionMessage, setNodeActionMessage] = useState<string | null>(
    null,
  );
  const [routingFormError, setRoutingFormError] = useState<string | null>(null);
  const [routingFormSuccess, setRoutingFormSuccess] = useState<string | null>(
    null,
  );
  const [routingLoadError, setRoutingLoadError] = useState<string | null>(null);
  const [previewRecipientEmail, setPreviewRecipientEmail] = useState('');
  const [previewRouteResult, setPreviewRouteResult] =
    useState<RoutingPreviewResult | null>(null);
  const [previewRouteError, setPreviewRouteError] = useState<string | null>(
    null,
  );

  // Sends State
  const [sends, setSends] = useState<SendRecord[]>([]);
  const [sendFlowError, setSendFlowError] = useState<string | null>(null);
  const initialSendFilterState = parseSendFiltersFromSearch(getSearch());
  const [sendRecipientQuery, setSendRecipientQuery] = useState(
    initialSendFilterState.recipientQuery,
  );
  const [sendProvenanceFilter, setSendProvenanceFilter] =
    useState<SendProvenanceFilter>(initialSendFilterState.provenanceFilter);
  const [sendPage, setSendPage] = useState(initialSendFilterState.page);
  const [sendHistoryPageInfo, setSendHistoryPageInfo] =
    useState<SendHistoryPageInfo>({
      limit: SEND_HISTORY_PAGE_SIZE,
      hasMore: false,
      nextCursor: null,
      page: initialSendFilterState.page,
    });

  // Sends Detailed View State
  const [selectedSendId, setSelectedSendId] = useState<string | null>(null);
  const [sendEvents, setSendEvents] = useState<DeliveryEventRecord[]>([]);
  const [sendEventsError, setSendEventsError] = useState<string | null>(null);
  const [sendWebhookDelivery, setSendWebhookDelivery] =
    useState<WebhookDeliveryRecord | null>(null);

  // Reporting State
  const [reportingData, setReportingData] = useState<ReportingData | null>(
    null,
  );
  const [reportingLoadError, setReportingLoadError] = useState<string | null>(
    null,
  );
  const initialReportingViewState = parseReportingViewFromSearch(getSearch());
  const [reportingSection, setReportingSection] = useState<ReportingSection>(
    initialReportingViewState.section,
  );

  const loadApiKeys = async () => {
    setApiKeyError(null);
    setIsLoadingApiKeys(true);
    try {
      const payload = await loadJson<{ data: ApiKeyRecord[] }>('/api/api-keys');
      setApiKeys(payload.data);
    } catch (error) {
      setApiKeyError(
        error instanceof Error ? error.message : 'Failed to load API keys',
      );
    } finally {
      setIsLoadingApiKeys(false);
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      setPathname(getPathname());
      setLocationSearch(getSearch());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (pathname !== '/sends') {
      return;
    }

    const parsed = parseSendFiltersFromSearch(locationSearch);
    setSendRecipientQuery(parsed.recipientQuery);
    setSendProvenanceFilter(parsed.provenanceFilter);
    setSendPage(parsed.page);
  }, [pathname, locationSearch]);

  useEffect(() => {
    if (pathname !== '/reporting') {
      return;
    }

    const parsed = parseReportingViewFromSearch(locationSearch);
    setReportingSection((current) =>
      current === parsed.section ? current : parsed.section,
    );
  }, [locationSearch, pathname]);

  useEffect(() => {
    if (pathname !== '/routing') {
      return;
    }

    const parsed = parseRoutingViewFromSearch(locationSearch);
    setRoutingSection((current) =>
      current === parsed.section ? current : parsed.section,
    );
  }, [locationSearch, pathname]);

  useEffect(() => {
    if (pathname !== '/routing') {
      return;
    }

    scrollSectionCardIntoView(`routing-card-${routingSection}`);
  }, [pathname, routingSection]);

  useEffect(() => {
    if (pathname !== '/access-keys') {
      return;
    }

    const parsed = parseApiKeyViewFromSearch(locationSearch);
    setApiKeyScopes(parsed.scopes);
  }, [locationSearch, pathname]);

  useEffect(() => {
    if (session.status !== 'authenticated' || pathname !== '/access-keys') {
      return;
    }

    void loadApiKeys();
  }, [pathname, session.status]);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const payload = await loadJson<
          | { authenticated: true; admin: { id: string; email: string } }
          | { authenticated: false }
        >('/api/auth/session');
        if (payload.authenticated) {
          setSession({ status: 'authenticated', admin: payload.admin });
          return;
        }
        setSession({ status: 'unauthenticated' });
        if (pathname !== '/login') navigate('/login');
      } catch {
        setSession({ status: 'unauthenticated' });
        if (pathname !== '/login') navigate('/login');
      }
    };
    void loadSession();
  }, [pathname]);

  useEffect(() => {
    if (session.status !== 'authenticated' || pathname !== '/routing') return;
    const loadRouting = async () => {
      setRoutingLoadError(null);
      try {
        const [nodesRes, rulesRes] = await Promise.all([
          loadJson<{ data: SendSmtpNodeRecord[] }>('/api/send-smtp-nodes'),
          loadJson<{ data: RoutingRuleRecord[]; version: number | null }>(
            '/api/routing-rules',
          ),
        ]);
        setSmtpNodes(nodesRes.data);
        setRoutingRules(rulesRes.data);
        setRoutingRulesVersion(rulesRes.version);
      } catch (error) {
        setRoutingLoadError(
          error instanceof Error
            ? error.message
            : 'Failed to load routing configuration',
        );
      }
    };
    void loadRouting();
  }, [pathname, session.status]);

  useEffect(() => {
    if (session.status !== 'authenticated' || pathname !== '/sends') return;
    const loadSendFlowData = async () => {
      setSendFlowError(null);
      try {
        const params = new URLSearchParams();

        if (sendRecipientQuery.trim()) {
          params.set('search', sendRecipientQuery.trim());
        }

        params.set('limit', String(SEND_HISTORY_PAGE_SIZE));
        params.set('page', String(sendPage));

        const sendsRes = await loadJson<{
          data: SendRecord[];
          pageInfo: SendHistoryPageInfo;
        }>(`/api/sends?${params.toString()}`);
        setSends(sendsRes.data);
        setSendHistoryPageInfo(sendsRes.pageInfo);
      } catch (error) {
        setSendFlowError(
          error instanceof Error ? error.message : 'Failed to load sends',
        );
      }
    };
    void loadSendFlowData();
  }, [pathname, sendPage, sendRecipientQuery, session.status]);

  useEffect(() => {
    if (session.status !== 'authenticated' || pathname !== '/reporting') return;
    const loadReportingData = async () => {
      setReportingLoadError(null);
      try {
        const payload = await loadJson<{ data: ReportingData }>(
          '/api/admin/reporting/delivery-events',
        );
        setReportingData(payload.data);
      } catch (error) {
        setReportingLoadError(
          error instanceof Error
            ? error.message
            : 'Failed to load reporting data',
        );
      }
    };
    void loadReportingData();
  }, [pathname, session.status]);

  useEffect(() => {
    if (pathname !== '/reporting' || !reportingData) {
      return;
    }

    scrollSectionCardIntoView(`reporting-card-${reportingSection}`);
  }, [pathname, reportingData, reportingSection]);

  const submitLogin = async (): Promise<void> => {
    setIsSubmittingLogin(true);
    setLoginError(null);
    try {
      const payload = await loadJson<{
        authenticated: true;
        admin: { id: string; email: string };
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      setSession({ status: 'authenticated', admin: payload.admin });
      navigate('/sends');
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
    }).catch(() => undefined);
    setSession({ status: 'unauthenticated' });
    navigate('/login');
  };

  const scrollSectionCardIntoView = (cardId: string) => {
    window.requestAnimationFrame(() => {
      document.getElementById(cardId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
        inline: 'nearest',
      });
    });
  };

  const handleRoutingSectionChange = (section: RoutingSection) => {
    setRoutingSection(section);
    const nextSearch = buildRoutingViewSearch({ section });
    if (nextSearch !== locationSearch) {
      window.history.replaceState({}, '', `${pathname}${nextSearch}`);
      setLocationSearch(nextSearch);
    }
    scrollSectionCardIntoView(`routing-card-${section}`);
  };

  const handleReportingSectionChange = (section: ReportingSection) => {
    setReportingSection(section);
    const nextSearch = buildReportingViewSearch({ section });
    if (nextSearch !== locationSearch) {
      window.history.replaceState({}, '', `${pathname}${nextSearch}`);
      setLocationSearch(nextSearch);
    }
    scrollSectionCardIntoView(`reporting-card-${section}`);
  };

  // API Key Actions
  const toggleScope = (scope: string) =>
    setApiKeyScopes((c) =>
      c.includes(scope) ? c.filter((v) => v !== scope) : [...c, scope],
    );
  const createApiKey = async () => {
    setApiKeyError(null);
    setCreatedApiKey(null);
    try {
      const p = await loadJson<{
        data: {
          id: string;
          label: string;
          keyPrefix: string;
          scopes: string[];
          rawKey: string;
        };
      }>('/api/api-keys', {
        method: 'POST',
        body: JSON.stringify({ label: apiKeyLabel, scopes: apiKeyScopes }),
      });
      setCreatedApiKey(p.data.rawKey);
      await loadApiKeys();
    } catch (e) {
      setApiKeyError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const revokeApiKey = async (apiKeyId: string) => {
    setApiKeyError(null);
    setRevokingApiKeyId(apiKeyId);
    try {
      const payload = await loadJson<{ data: ApiKeyRecord }>(
        `/api/api-keys/${apiKeyId}/revoke`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      );

      setApiKeys((current) =>
        current.map((apiKey) =>
          apiKey.id === apiKeyId ? payload.data : apiKey,
        ),
      );
      await loadApiKeys();
    } catch (error) {
      setApiKeyError(error instanceof Error ? error.message : 'Failed');
    } finally {
      setRevokingApiKeyId(null);
    }
  };

  const deleteApiKey = async (apiKeyId: string) => {
    setApiKeyError(null);
    setDeletingApiKeyId(apiKeyId);
    try {
      await loadJson(`/api/api-keys/${apiKeyId}`, {
        method: 'DELETE',
        body: JSON.stringify({}),
      });

      setApiKeys((current) =>
        current.filter((apiKey) => apiKey.id !== apiKeyId),
      );
      await loadApiKeys();
    } catch (error) {
      setApiKeyError(error instanceof Error ? error.message : 'Failed');
    } finally {
      setDeletingApiKeyId(null);
    }
  };

  // Routing Actions
  const createSmtpNode = async () => {
    setNodeFormError(null);
    setNodeActionMessage(null);
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
      const nodesRes = await loadJson<{ data: SendSmtpNodeRecord[] }>(
        '/api/send-smtp-nodes',
      );
      setSmtpNodes(nodesRes.data);
      setNodeName('');
      setNodeHost('');
      setNodePort('2525');
      setNodePriority('100');
    } catch (e) {
      setNodeFormError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setIsCreatingNode(false);
    }
  };
  const updateSmtpNode = async (
    nodeId: string,
    updates: Partial<Pick<SendSmtpNodeRecord, 'isActive'>>,
  ) => {
    try {
      setNodeActionMessage(null);
      await loadJson(`/api/send-smtp-nodes/${nodeId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      const nodesRes = await loadJson<{ data: SendSmtpNodeRecord[] }>(
        '/api/send-smtp-nodes',
      );
      setSmtpNodes(nodesRes.data);
    } catch (e) {
      setNodeFormError(e instanceof Error ? e.message : 'Failed');
    }
  };
  const testSmtpNode = async (nodeId: string) => {
    setNodeFormError(null);
    setNodeActionMessage(null);
    setTestingNodeId(nodeId);
    try {
      const result = await loadJson<{
        data: { ok: boolean; error: string | null };
      }>(`/api/send-smtp-nodes/${nodeId}/test`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setNodeTestResults((current) => ({
        ...current,
        [nodeId]: result.data,
      }));
    } catch (e) {
      setNodeFormError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setTestingNodeId(null);
    }
  };
  const deleteSmtpNode = async (nodeId: string) => {
    setNodeFormError(null);
    setNodeActionMessage(null);
    setDeletingNodeId(nodeId);
    try {
      await loadJson(`/api/send-smtp-nodes/${nodeId}`, {
        method: 'DELETE',
        body: JSON.stringify({}),
      });
      const nodesRes = await loadJson<{ data: SendSmtpNodeRecord[] }>(
        '/api/send-smtp-nodes',
      );
      setSmtpNodes(nodesRes.data);
      setNodeActionMessage('노드가 삭제되었습니다.');
    } catch (e) {
      setNodeFormError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setDeletingNodeId(null);
    }
  };
  const saveRoutingRules = async () => {
    setRoutingFormError(null);
    setRoutingFormSuccess(null);
    try {
      await loadJson('/api/routing-rules', {
        method: 'POST',
        body: JSON.stringify({ rules: routingRules }),
      });
      const rulesRes = await loadJson<{
        data: RoutingRuleRecord[];
        version: number | null;
      }>('/api/routing-rules');
      setRoutingRules(rulesRes.data);
      setRoutingRulesVersion(rulesRes.version);
      setRoutingFormSuccess('규칙이 저장되었습니다.');
    } catch (e) {
      setRoutingFormError(e instanceof Error ? e.message : 'Failed');
    }
  };
  const addRuleRow = () =>
    setRoutingRules([
      ...routingRules,
      {
        id: `draft-${routingRules.length + 1}`,
        matchType: 'exact',
        domain: '',
        sendSmtpNodeId: '',
        failoverNodeIds: [],
        priority: 100,
        isActive: true,
      },
    ]);
  const updateRule = (index: number, updates: Partial<RoutingRuleRecord>) => {
    const newRules = [...routingRules];
    newRules[index] = { ...newRules[index], ...updates };
    setRoutingRules(newRules);
  };
  const updateFailoverNode = (
    ruleIndex: number,
    fallbackIndex: number,
    nodeId: string,
  ) => {
    const nextFailovers = [...routingRules[ruleIndex].failoverNodeIds];
    nextFailovers[fallbackIndex] = nodeId;
    updateRule(ruleIndex, {
      failoverNodeIds: Array.from(new Set(nextFailovers.filter(Boolean))),
    });
  };
  const addFailoverNode = (ruleIndex: number, nodeId: string) => {
    if (!nodeId) {
      return;
    }

    const current = routingRules[ruleIndex];
    if (
      nodeId === current.sendSmtpNodeId ||
      current.failoverNodeIds.includes(nodeId)
    ) {
      return;
    }

    updateRule(ruleIndex, {
      failoverNodeIds: [...current.failoverNodeIds, nodeId],
    });
  };
  const removeFailoverNode = (ruleIndex: number, fallbackIndex: number) => {
    updateRule(ruleIndex, {
      failoverNodeIds: routingRules[ruleIndex].failoverNodeIds.filter(
        (_, index) => index !== fallbackIndex,
      ),
    });
  };
  const moveFailoverNode = (
    ruleIndex: number,
    fallbackIndex: number,
    direction: 'up' | 'down',
  ) => {
    const nextFailovers = [...routingRules[ruleIndex].failoverNodeIds];
    const targetIndex =
      direction === 'up' ? fallbackIndex - 1 : fallbackIndex + 1;

    if (targetIndex < 0 || targetIndex >= nextFailovers.length) {
      return;
    }

    [nextFailovers[fallbackIndex], nextFailovers[targetIndex]] = [
      nextFailovers[targetIndex],
      nextFailovers[fallbackIndex],
    ];

    updateRule(ruleIndex, { failoverNodeIds: nextFailovers });
  };
  const removeRule = (index: number) =>
    setRoutingRules(routingRules.filter((_, i) => i !== index));
  const previewRoute = async () => {
    setPreviewRouteError(null);
    try {
      const res = await loadJson<{ data: RoutingPreviewResult | null }>(
        '/api/routing-rules/preview',
        {
          method: 'POST',
          body: JSON.stringify({ recipientEmail: previewRecipientEmail }),
        },
      );
      setPreviewRouteResult(res.data);
      if (!res.data) setPreviewRouteError('일치하는 규칙이 없습니다.');
    } catch (e) {
      setPreviewRouteResult(null);
      setPreviewRouteError(e instanceof Error ? e.message : 'Failed');
    }
  };

  // Send Actions
  const loadSendEvents = async (sendId: string) => {
    if (selectedSendId === sendId) {
      setSelectedSendId(null);
      return;
    }
    setSelectedSendId(sendId);
    setSendEventsError(null);
    setSendEvents([]);
    setSendWebhookDelivery(null);
    try {
      const res = await loadJson<{
        data: DeliveryEventRecord[];
        webhookDelivery: WebhookDeliveryRecord | null;
      }>(`/api/admin/sends/${sendId}/delivery-events`);
      setSendEvents(res.data);
      setSendWebhookDelivery(res.webhookDelivery);
    } catch (e) {
      setSendEventsError(e instanceof Error ? e.message : 'Failed');
    }
  };
  const sendTotalCount = sends.length;
  const sendIndividualCount = sends.filter(
    (send) => send.kind === 'individual',
  ).length;
  const sendDeliveredCount = sends.filter(
    (send) => send.status === 'delivered',
  ).length;
  const sendAttentionCount = sends.filter((send) =>
    ['bounced', 'deferred'].includes(send.status),
  ).length;
  const filteredSends = filterSends({
    sends,
    recipientQuery: sendRecipientQuery,
    provenanceFilter: sendProvenanceFilter,
  });

  useEffect(() => {
    if (pathname !== '/sends') {
      return;
    }

    const nextSearch = buildSendFiltersSearch({
      recipientQuery: sendRecipientQuery,
      provenanceFilter: sendProvenanceFilter,
      page: sendPage,
    });

    if (nextSearch === locationSearch) {
      return;
    }

    window.history.replaceState({}, '', `${pathname}${nextSearch}`);
    setLocationSearch(nextSearch);
  }, [
    locationSearch,
    pathname,
    sendPage,
    sendProvenanceFilter,
    sendRecipientQuery,
  ]);

  useEffect(() => {
    if (pathname !== '/access-keys') {
      return;
    }

    const nextSearch = buildApiKeyViewSearch({
      scopes: apiKeyScopes.filter((scope): scope is 'individual-send' =>
        ['individual-send'].includes(scope),
      ),
    });

    if (nextSearch === locationSearch) {
      return;
    }

    window.history.replaceState({}, '', `${pathname}${nextSearch}`);
    setLocationSearch(nextSearch);
  }, [apiKeyScopes, locationSearch, pathname]);

  useEffect(() => {
    if (
      selectedSendId &&
      !filteredSends.some((send) => send.id === selectedSendId)
    ) {
      setSelectedSendId(null);
      setSendEvents([]);
      setSendEventsError(null);
      setSendWebhookDelivery(null);
    }
  }, [filteredSends, selectedSendId]);

  if (session.status === 'loading') {
    return (
      <div className="login-container">
        <p>로딩 중...</p>
      </div>
    );
  }

  if (session.status === 'unauthenticated' || pathname === '/login') {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-logo">Supermailer</div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitLogin();
            }}
          >
            <div className="form-group">
              <label>이메일</label>
              <input
                aria-label="이메일"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                type="email"
              />
            </div>
            <div className="form-group">
              <label>비밀번호</label>
              <input
                aria-label="비밀번호"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                type="password"
              />
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={isSubmittingLogin}
              type="submit"
            >
              {isSubmittingLogin ? '로그인 중...' : '로그인'}
            </button>
          </form>
          {loginError && (
            <p
              role="alert"
              style={{ color: 'var(--color-error)', marginTop: '1rem' }}
            >
              {loginError}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">Supermailer</div>
        <nav className="nav-menu">
          <button
            className={`nav-item ${pathname === '/sends' ? 'active' : ''}`}
            onClick={() => navigate('/sends')}
          >
            발송 관리 (Sends)
          </button>
          <hr
            style={{
              borderColor: 'var(--bg-sidebar-hover)',
              margin: 'var(--space-2) 0',
            }}
          />
          <button
            className={`nav-item secondary ${pathname === '/routing' ? 'active' : ''}`}
            onClick={() =>
              navigate(
                '/routing',
                buildRoutingViewSearch({ section: routingSection }),
              )
            }
          >
            라우팅 설정 (Routing)
          </button>
          <button
            className={`nav-item secondary ${pathname === '/reporting' ? 'active' : ''}`}
            onClick={() =>
              navigate(
                '/reporting',
                buildReportingViewSearch({ section: reportingSection }),
              )
            }
          >
            리포트 (Reporting)
          </button>
          <button
            className={`nav-item secondary ${pathname === '/access-keys' ? 'active' : ''}`}
            onClick={() =>
              navigate(
                '/access-keys',
                buildApiKeyViewSearch({
                  scopes: apiKeyScopes.filter(
                    (scope): scope is 'individual-send' =>
                      ['individual-send'].includes(scope),
                  ),
                }),
              )
            }
          >
            API 키 (API Keys)
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="main-content">
        <header className="top-header">
          <div></div>
          <div className="flex items-center gap-4">
            <span className="user-info">{session.admin.email}</span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => void logout()}
            >
              로그아웃
            </button>
          </div>
        </header>

        <div className="page-container">
          {pathname === '/sends' && (
            <div>
              <div className="page-header">
                <h1 className="page-title">발송 관리</h1>
              </div>

              <div className="grid grid-cols-4 mb-6">
                <div className="stat-card">
                  <div className="stat-title">전체 발송</div>
                  <div className="stat-value">{sendTotalCount}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-title">개별 발송</div>
                  <div className="stat-value">{sendIndividualCount}</div>
                </div>
                <div className="stat-card">
                  <div
                    className="stat-title"
                    style={{ color: 'var(--color-success)' }}
                  >
                    전달 완료
                  </div>
                  <div className="stat-value">{sendDeliveredCount}</div>
                </div>
                <div className="stat-card">
                  <div
                    className="stat-title"
                    style={{ color: 'var(--color-warning)' }}
                  >
                    확인 필요
                  </div>
                  <div className="stat-value">{sendAttentionCount}</div>
                </div>
              </div>

              {sendFlowError && (
                <div className="card">
                  <div
                    className="card-body"
                    style={{ color: 'var(--color-error)' }}
                  >
                    {sendFlowError}
                  </div>
                </div>
              )}

              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">발송 목록 및 이력 조회</h3>
                </div>
                <div className="card-body" style={{ paddingBottom: 0 }}>
                  <div className="grid grid-cols-2">
                    <div className="form-group">
                      <label>검색</label>
                      <input
                        data-testid="send-recipient-search"
                        placeholder="수신자 이메일 검색"
                        value={sendRecipientQuery}
                        onChange={(event) => {
                          setSendRecipientQuery(event.target.value);
                          setSendPage(1);
                        }}
                      />
                    </div>
                    <div className="form-group">
                      <label>발송 경로 필터</label>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          className={
                            sendProvenanceFilter === 'all'
                              ? 'btn btn-primary btn-sm'
                              : 'btn btn-secondary btn-sm'
                          }
                          data-testid="send-provenance-filter-all"
                          onClick={() => {
                            setSendProvenanceFilter('all');
                            setSendPage(1);
                          }}
                          type="button"
                        >
                          전체
                        </button>
                        <button
                          className={
                            sendProvenanceFilter === 'manual'
                              ? 'btn btn-primary btn-sm'
                              : 'btn btn-secondary btn-sm'
                          }
                          data-testid="send-provenance-filter-manual"
                          onClick={() => {
                            setSendProvenanceFilter('manual');
                            setSendPage(1);
                          }}
                          type="button"
                        >
                          직접 입력
                        </button>
                      </div>
                    </div>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
                    페이지 {sendPage} · 현재 페이지 {filteredSends.length}건을
                    표시합니다.
                  </p>
                  <div
                    className="flex gap-2 items-center"
                    style={{ marginBottom: '1rem' }}
                  >
                    <button
                      className="btn btn-secondary btn-sm"
                      data-testid="send-history-page-prev"
                      disabled={sendPage <= 1}
                      onClick={() =>
                        setSendPage((current) => Math.max(1, current - 1))
                      }
                      type="button"
                    >
                      이전 페이지
                    </button>
                    <span data-testid="send-history-page-current">
                      {sendPage}
                    </span>
                    <button
                      className="btn btn-secondary btn-sm"
                      data-testid="send-history-page-next"
                      disabled={!sendHistoryPageInfo.hasMore}
                      onClick={() => setSendPage((current) => current + 1)}
                      type="button"
                    >
                      다음 페이지
                    </button>
                  </div>
                </div>
                <div className="data-table-wrapper">
                  <table className="data-table" data-testid="send-list">
                    <thead>
                      <tr>
                        <th>수신자</th>
                        <th>상태</th>
                        <th>생성일시</th>
                        <th>액션</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSends.map((s) => (
                        <React.Fragment key={s.id}>
                          <tr data-testid={`send-${s.id}`}>
                            <td style={{ fontWeight: 500 }}>
                              <div>{s.recipientEmail}</div>
                            </td>
                            <td>
                              <span
                                className={`badge ${s.status === 'delivered' ? 'badge-success' : s.status === 'bounced' ? 'badge-error' : 'badge-neutral'}`}
                              >
                                {s.status}
                              </span>
                            </td>
                            <td>{new Date(s.createdAt).toLocaleString()}</td>
                            <td>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => void loadSendEvents(s.id)}
                              >
                                {selectedSendId === s.id
                                  ? '이력 닫기'
                                  : '이력 보기'}
                              </button>
                            </td>
                          </tr>
                          {selectedSendId === s.id && (
                            <tr
                              style={{
                                backgroundColor: 'var(--bg-surface-hover)',
                              }}
                            >
                              <td colSpan={4} style={{ padding: 0 }}>
                                <div
                                  data-testid={`send-events-${s.id}`}
                                  style={{
                                    padding: 'var(--space-4)',
                                    borderTop: '1px dashed var(--border-light)',
                                    borderBottom:
                                      '1px solid var(--border-strong)',
                                  }}
                                >
                                  <div className="grid grid-cols-2">
                                    <div>
                                      <h4
                                        style={{
                                          fontSize: 'var(--font-sm)',
                                          marginBottom: '0.5rem',
                                        }}
                                      >
                                        배달 이벤트 (Event History)
                                      </h4>
                                      {sendEventsError && (
                                        <p
                                          style={{
                                            color: 'var(--color-error)',
                                          }}
                                        >
                                          {sendEventsError}
                                        </p>
                                      )}
                                      {sendEvents.length === 0 &&
                                      !sendEventsError ? (
                                        <p
                                          style={{
                                            fontSize: 'var(--font-sm)',
                                            color: 'var(--text-secondary)',
                                          }}
                                        >
                                          기록된 이벤트가 없습니다.
                                        </p>
                                      ) : (
                                        <ul
                                          style={{
                                            paddingLeft: '1rem',
                                            fontSize: 'var(--font-sm)',
                                            margin: 0,
                                          }}
                                        >
                                          {sendEvents.map((e) => (
                                            <li
                                              key={e.id}
                                              data-testid={`event-${e.id}`}
                                              style={{
                                                marginBottom: '0.25rem',
                                              }}
                                            >
                                              <strong>{e.type}</strong>{' '}
                                              <span
                                                style={{
                                                  color:
                                                    'var(--text-secondary)',
                                                }}
                                              >
                                                (
                                                {new Date(
                                                  e.occurredAt,
                                                ).toLocaleTimeString()}
                                                )
                                              </span>
                                              {e.smtpReplyCode && (
                                                <span>
                                                  {' '}
                                                  - SMTP {e.smtpReplyCode}
                                                </span>
                                              )}
                                              {e.reason && (
                                                <div
                                                  style={{
                                                    color: 'var(--color-error)',
                                                  }}
                                                >
                                                  사유: {e.reason}
                                                </div>
                                              )}
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                    {s.kind === 'individual' && (
                                      <div data-testid={`send-webhook-${s.id}`}>
                                        <h4
                                          style={{
                                            fontSize: 'var(--font-sm)',
                                            marginBottom: '0.5rem',
                                          }}
                                        >
                                          웹훅 상태 (Webhook Status)
                                        </h4>
                                        {!sendWebhookDelivery ? (
                                          <p
                                            style={{
                                              fontSize: 'var(--font-sm)',
                                              color: 'var(--text-secondary)',
                                            }}
                                          >
                                            웹훅 기록이 없습니다.
                                          </p>
                                        ) : (
                                          <div
                                            style={{
                                              fontSize: 'var(--font-sm)',
                                            }}
                                          >
                                            <div>
                                              <strong>상태:</strong>{' '}
                                              <span
                                                data-testid="webhook-status"
                                                className="badge badge-neutral ml-2"
                                              >
                                                {sendWebhookDelivery.status}
                                              </span>
                                            </div>
                                            <div className="mt-2">
                                              <strong>시도 횟수:</strong>{' '}
                                              {sendWebhookDelivery.attemptCount}
                                              회
                                            </div>
                                            <div
                                              className="mt-2"
                                              style={{ wordBreak: 'break-all' }}
                                            >
                                              <strong>URL:</strong>{' '}
                                              {sendWebhookDelivery.targetUrl}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                      {filteredSends.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            조건에 맞는 발송이 없습니다.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {pathname === '/routing' && (
            <div>
              <div className="flex gap-2 mb-4">
                <button
                  aria-pressed={routingSection === 'nodes'}
                  className={
                    routingSection === 'nodes'
                      ? 'btn btn-primary btn-sm'
                      : 'btn btn-secondary btn-sm'
                  }
                  data-testid="routing-section-nodes"
                  onClick={() => handleRoutingSectionChange('nodes')}
                  type="button"
                >
                  SMTP 노드
                </button>
                <button
                  aria-pressed={routingSection === 'rules'}
                  className={
                    routingSection === 'rules'
                      ? 'btn btn-primary btn-sm'
                      : 'btn btn-secondary btn-sm'
                  }
                  data-testid="routing-section-rules"
                  onClick={() => handleRoutingSectionChange('rules')}
                  type="button"
                >
                  라우팅 규칙
                </button>
                <button
                  aria-pressed={routingSection === 'preview'}
                  className={
                    routingSection === 'preview'
                      ? 'btn btn-primary btn-sm'
                      : 'btn btn-secondary btn-sm'
                  }
                  data-testid="routing-section-preview"
                  onClick={() => handleRoutingSectionChange('preview')}
                  type="button"
                >
                  라우트 미리보기
                </button>
              </div>
              <div className="card" id="routing-card-nodes">
                <div className="card-header">
                  <h3 className="card-title">SMTP 노드 설정</h3>
                </div>
                <div
                  className="card-body"
                  data-testid="routing-card-nodes"
                  style={{
                    border:
                      routingSection === 'nodes'
                        ? '2px solid var(--border-focus)'
                        : undefined,
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void createSmtpNode();
                    }}
                    className="flex gap-2 items-center mb-4"
                  >
                    <input
                      placeholder="이름 (예: main-node)"
                      value={nodeName}
                      onChange={(e) => setNodeName(e.target.value)}
                      required
                    />
                    <input
                      placeholder="호스트 (예: localhost)"
                      value={nodeHost}
                      onChange={(e) => setNodeHost(e.target.value)}
                      required
                    />
                    <input
                      type="number"
                      placeholder="포트"
                      style={{ width: '100px' }}
                      value={nodePort}
                      onChange={(e) => setNodePort(e.target.value)}
                      required
                    />
                    <input
                      type="number"
                      placeholder="우선순위"
                      style={{ width: '100px' }}
                      value={nodePriority}
                      onChange={(e) => setNodePriority(e.target.value)}
                      required
                    />
                    <button
                      className="btn btn-primary"
                      type="submit"
                      disabled={isCreatingNode}
                    >
                      추가
                    </button>
                  </form>
                  {nodeFormError && (
                    <p style={{ color: 'var(--color-error)' }}>
                      {nodeFormError}
                    </p>
                  )}
                  {nodeActionMessage && (
                    <p style={{ color: 'var(--color-success)' }}>
                      {nodeActionMessage}
                    </p>
                  )}
                  <ul
                    data-testid="smtp-node-list"
                    style={{ paddingLeft: '1rem' }}
                  >
                    {smtpNodes.map((n) => (
                      <li
                        key={n.id}
                        data-testid={`smtp-node-${n.name}`}
                        style={{ marginBottom: '0.5rem' }}
                      >
                        <strong>{n.name}</strong> ({n.host}:{n.port}) -
                        우선순위: {n.priority} -{' '}
                        {n.isActive ? (
                          <span className="badge badge-success">활성</span>
                        ) : (
                          <span className="badge badge-neutral">비활성</span>
                        )}
                        <button
                          className="btn btn-secondary btn-sm ml-2"
                          onClick={() =>
                            void updateSmtpNode(n.id, { isActive: !n.isActive })
                          }
                        >
                          {n.isActive ? '비활성화' : '활성화'}
                        </button>
                        <button
                          className="btn btn-secondary btn-sm ml-2"
                          data-testid={`smtp-node-test-${n.name}`}
                          disabled={testingNodeId === n.id}
                          onClick={() => void testSmtpNode(n.id)}
                        >
                          {testingNodeId === n.id
                            ? '테스트 중...'
                            : '연결 테스트'}
                        </button>
                        <button
                          className="btn btn-danger btn-sm ml-2"
                          data-testid={`smtp-node-delete-${n.name}`}
                          disabled={deletingNodeId === n.id}
                          onClick={() => void deleteSmtpNode(n.id)}
                        >
                          {deletingNodeId === n.id ? '삭제 중...' : '삭제'}
                        </button>
                        {nodeTestResults[n.id] ? (
                          <span
                            data-testid={`smtp-node-test-result-${n.name}`}
                            className={`badge ml-2 ${nodeTestResults[n.id].ok ? 'badge-success' : 'badge-error'}`}
                          >
                            {nodeTestResults[n.id].ok
                              ? '연결 성공'
                              : `연결 실패: ${nodeTestResults[n.id].error ?? '알 수 없는 오류'}`}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="card" id="routing-card-rules">
                <div className="card-header">
                  <h3 className="card-title">라우팅 규칙</h3>
                </div>
                <div
                  className="card-body"
                  data-testid="routing-card-rules"
                  style={{
                    border:
                      routingSection === 'rules'
                        ? '2px solid var(--border-focus)'
                        : undefined,
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  {routingLoadError && (
                    <p role="alert" style={{ color: 'var(--color-error)' }}>
                      {routingLoadError}
                    </p>
                  )}
                  <div className="flex justify-between mb-4 items-center">
                    <p
                      data-testid="routing-default-rule-status"
                      style={{ margin: 0 }}
                    >
                      버전: {routingRulesVersion ?? '없음'} | 활성 기본 규칙:{' '}
                      {
                        routingRules.filter(
                          (r) =>
                            r.matchType === 'default' && (r.isActive ?? true),
                        ).length
                      }
                      개
                    </p>
                    <button
                      className="btn btn-primary"
                      onClick={() => void saveRoutingRules()}
                    >
                      변경사항 저장
                    </button>
                  </div>
                  {routingFormError && (
                    <p role="alert" style={{ color: 'var(--color-error)' }}>
                      {routingFormError}
                    </p>
                  )}
                  {routingFormSuccess && (
                    <p style={{ color: 'var(--color-success)' }}>
                      {routingFormSuccess}
                    </p>
                  )}

                  <div
                    data-testid="routing-rules-list"
                    className="flex-col gap-2"
                  >
                    {routingRules.map((rule, idx) => (
                      <div
                        key={rule.id || idx}
                        data-testid={`routing-rule-${idx}`}
                        className="flex-col gap-2"
                        style={{
                          padding: '0.75rem',
                          background: 'var(--bg-surface-hover)',
                          borderRadius: 'var(--radius-md)',
                        }}
                      >
                        <div className="flex gap-2 items-center">
                          <select
                            value={rule.matchType}
                            onChange={(e) =>
                              updateRule(idx, {
                                matchType: e.target.value as
                                  | 'exact'
                                  | 'default',
                                domain:
                                  e.target.value === 'default'
                                    ? null
                                    : rule.domain,
                              })
                            }
                          >
                            <option value="exact">특정 도메인 규칙</option>
                            <option value="default">기본 규칙</option>
                          </select>
                          {rule.matchType === 'exact' && (
                            <input
                              data-testid={`routing-domain-${idx}`}
                              placeholder="적용할 도메인 (예: gmail.com)"
                              value={rule.domain ?? ''}
                              onChange={(e) =>
                                updateRule(idx, { domain: e.target.value })
                              }
                            />
                          )}
                          <input
                            data-testid={`routing-priority-${idx}`}
                            type="number"
                            style={{ width: '80px' }}
                            value={rule.priority}
                            onChange={(e) =>
                              updateRule(idx, {
                                priority: parseNumberInput(
                                  e.target.value,
                                  rule.priority,
                                ),
                              })
                            }
                          />
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              margin: 0,
                            }}
                          >
                            활성{' '}
                            <input
                              data-testid={`routing-active-${idx}`}
                              type="checkbox"
                              checked={rule.isActive ?? true}
                              onChange={(e) =>
                                updateRule(idx, { isActive: e.target.checked })
                              }
                            />
                          </label>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => removeRule(idx)}
                          >
                            삭제
                          </button>
                        </div>

                        <div
                          style={{
                            display: 'grid',
                            gap: '0.75rem',
                            background: 'var(--bg-surface)',
                            padding: '0.75rem',
                            borderRadius: 'var(--radius-md)',
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                marginBottom: '0.35rem',
                              }}
                            >
                              1순위 (Primary)
                            </div>
                            <select
                              data-testid={`routing-node-${idx}`}
                              value={rule.sendSmtpNodeId}
                              onChange={(e) =>
                                updateRule(idx, {
                                  sendSmtpNodeId: e.target.value,
                                  failoverNodeIds: rule.failoverNodeIds.filter(
                                    (nodeId) => nodeId !== e.target.value,
                                  ),
                                })
                              }
                            >
                              <option value="">우선 발송 노드 선택...</option>
                              {smtpNodes.map((n) => (
                                <option key={n.id} value={n.id}>
                                  {n.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <div
                              style={{
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                marginBottom: '0.35rem',
                              }}
                            >
                              장애 시 순서대로 시도할 노드들
                            </div>
                            {rule.failoverNodeIds.length === 0 ? (
                              <p
                                style={{
                                  margin: '0 0 0.5rem',
                                  color: 'var(--text-secondary)',
                                  fontSize: '0.875rem',
                                }}
                              >
                                추가된 fallback 노드가 없습니다.
                              </p>
                            ) : (
                              <div className="flex-col gap-2">
                                {rule.failoverNodeIds.map(
                                  (failoverNodeId, failoverIndex) => (
                                    <div
                                      key={`${rule.id}-fallback-${failoverIndex}`}
                                      className="flex gap-2 items-center"
                                      data-testid={`routing-failover-row-${idx}-${failoverIndex}`}
                                    >
                                      <span
                                        style={{
                                          minWidth: '120px',
                                          fontSize: '0.875rem',
                                        }}
                                      >
                                        {failoverIndex + 2}순위
                                      </span>
                                      <select
                                        data-testid={`routing-failover-select-${idx}-${failoverIndex}`}
                                        value={failoverNodeId}
                                        onChange={(e) =>
                                          updateFailoverNode(
                                            idx,
                                            failoverIndex,
                                            e.target.value,
                                          )
                                        }
                                      >
                                        <option value="">노드 선택...</option>
                                        {smtpNodes
                                          .filter(
                                            (node) =>
                                              node.id !== rule.sendSmtpNodeId ||
                                              node.id === failoverNodeId,
                                          )
                                          .map((node) => (
                                            <option
                                              key={node.id}
                                              value={node.id}
                                            >
                                              {node.name}
                                            </option>
                                          ))}
                                      </select>
                                      <button
                                        className="btn btn-secondary btn-sm"
                                        data-testid={`routing-failover-up-${idx}-${failoverIndex}`}
                                        disabled={failoverIndex === 0}
                                        onClick={() =>
                                          moveFailoverNode(
                                            idx,
                                            failoverIndex,
                                            'up',
                                          )
                                        }
                                        type="button"
                                      >
                                        ↑
                                      </button>
                                      <button
                                        className="btn btn-secondary btn-sm"
                                        data-testid={`routing-failover-down-${idx}-${failoverIndex}`}
                                        disabled={
                                          failoverIndex ===
                                          rule.failoverNodeIds.length - 1
                                        }
                                        onClick={() =>
                                          moveFailoverNode(
                                            idx,
                                            failoverIndex,
                                            'down',
                                          )
                                        }
                                        type="button"
                                      >
                                        ↓
                                      </button>
                                      <button
                                        className="btn btn-danger btn-sm"
                                        data-testid={`routing-failover-remove-${idx}-${failoverIndex}`}
                                        onClick={() =>
                                          removeFailoverNode(idx, failoverIndex)
                                        }
                                        type="button"
                                      >
                                        삭제
                                      </button>
                                    </div>
                                  ),
                                )}
                              </div>
                            )}

                            <div style={{ marginTop: '0.5rem' }}>
                              <select
                                data-testid={`routing-add-failover-${idx}`}
                                defaultValue=""
                                onChange={(e) => {
                                  addFailoverNode(idx, e.target.value);
                                  e.currentTarget.value = '';
                                }}
                              >
                                <option value="">
                                  + fallback 노드 추가...
                                </option>
                                {smtpNodes
                                  .filter(
                                    (node) =>
                                      node.id !== rule.sendSmtpNodeId &&
                                      !rule.failoverNodeIds.includes(node.id),
                                  )
                                  .map((node) => (
                                    <option key={node.id} value={node.id}>
                                      {node.name}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>

                          <div
                            style={{
                              fontSize: '0.875rem',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            현재 라우팅 순서:{' '}
                            {[rule.sendSmtpNodeId, ...rule.failoverNodeIds]
                              .map(
                                (nodeId) =>
                                  smtpNodes.find((node) => node.id === nodeId)
                                    ?.name ?? nodeId,
                              )
                              .filter(Boolean)
                              .join(' → ') ||
                              '아직 노드가 선택되지 않았습니다.'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    className="btn btn-secondary mt-4"
                    onClick={addRuleRow}
                  >
                    + 새 규칙 추가
                  </button>
                </div>
              </div>

              <div className="card" id="routing-card-preview">
                <div className="card-header">
                  <h3 className="card-title">라우트 미리보기</h3>
                </div>
                <div
                  className="card-body"
                  data-testid="routing-card-preview"
                  style={{
                    border:
                      routingSection === 'preview'
                        ? '2px solid var(--border-focus)'
                        : undefined,
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div className="flex gap-2 items-center">
                    <input
                      data-testid="route-preview-input"
                      value={previewRecipientEmail}
                      onChange={(e) => setPreviewRecipientEmail(e.target.value)}
                      placeholder="테스트할 수신자 이메일"
                    />
                    <button
                      className="btn btn-secondary"
                      onClick={() => void previewRoute()}
                    >
                      확인
                    </button>
                  </div>
                  {previewRouteError && (
                    <p className="mt-4" style={{ color: 'var(--color-error)' }}>
                      {previewRouteError}
                    </p>
                  )}
                  {previewRouteResult && (
                    <div
                      data-testid="route-preview-result"
                      className="mt-4 p-4"
                      style={{
                        background: 'var(--color-info-bg)',
                        color: 'var(--color-info-text)',
                        borderRadius: 'var(--radius-md)',
                      }}
                    >
                      <strong>매칭된 규칙:</strong>{' '}
                      {previewRouteResult.rule.matchType === 'exact'
                        ? `${previewRouteResult.rule.domain ?? '도메인 규칙'} 전용`
                        : '기본 규칙'}{' '}
                      <br />
                      <strong>라우팅 순서 (Failover 체인):</strong>
                      <ol
                        style={{
                          margin: '0.5rem 0 0',
                          paddingLeft: '1.25rem',
                        }}
                      >
                        {previewRouteResult.nodes.map((node, index) => (
                          <li key={node.id}>
                            {index === 0
                              ? `1순위 (Primary) : ${node.name}`
                              : `${index + 1}순위 (Fallback ${index}) : ${node.name}`}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {pathname === '/reporting' && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">리포트 및 통계</h3>
              </div>
              <div className="card-body">
                <div className="flex gap-2 mb-4">
                  <button
                    aria-pressed={reportingSection === 'status'}
                    className={
                      reportingSection === 'status'
                        ? 'btn btn-primary btn-sm'
                        : 'btn btn-secondary btn-sm'
                    }
                    data-testid="reporting-section-status"
                    onClick={() => handleReportingSectionChange('status')}
                    type="button"
                  >
                    상태별 분류
                  </button>
                  <button
                    aria-pressed={reportingSection === 'codes'}
                    className={
                      reportingSection === 'codes'
                        ? 'btn btn-primary btn-sm'
                        : 'btn btn-secondary btn-sm'
                    }
                    data-testid="reporting-section-codes"
                    onClick={() => handleReportingSectionChange('codes')}
                    type="button"
                  >
                    SMTP 응답 코드
                  </button>
                  <button
                    aria-pressed={reportingSection === 'nodes'}
                    className={
                      reportingSection === 'nodes'
                        ? 'btn btn-primary btn-sm'
                        : 'btn btn-secondary btn-sm'
                    }
                    data-testid="reporting-section-nodes"
                    onClick={() => handleReportingSectionChange('nodes')}
                    type="button"
                  >
                    노드별 성과
                  </button>
                </div>
                {reportingLoadError && (
                  <p style={{ color: 'var(--color-error)' }}>
                    {reportingLoadError}
                  </p>
                )}
                {!reportingData && !reportingLoadError ? (
                  <p>로딩 중...</p>
                ) : (
                  reportingData && (
                    <div className="grid grid-cols-3">
                      <div
                        id="reporting-card-status"
                        data-testid="reporting-card-status"
                        style={{
                          background: 'var(--bg-surface-hover)',
                          border:
                            reportingSection === 'status'
                              ? '2px solid var(--border-focus)'
                              : '1px solid transparent',
                          padding: '1rem',
                          borderRadius: 'var(--radius-md)',
                        }}
                      >
                        <h4 style={{ marginBottom: '1rem' }}>상태별 분류</h4>
                        <ul
                          data-testid="reporting-status-counts"
                          style={{ paddingLeft: '1rem' }}
                        >
                          {reportingData.statusCounts.length === 0 ? (
                            <li>데이터 없음</li>
                          ) : (
                            reportingData.statusCounts.map((c) => (
                              <li key={c.status}>
                                <strong>{c.status}</strong>: {c.count}건
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                      <div
                        id="reporting-card-codes"
                        data-testid="reporting-card-codes"
                        style={{
                          background: 'var(--bg-surface-hover)',
                          border:
                            reportingSection === 'codes'
                              ? '2px solid var(--border-focus)'
                              : '1px solid transparent',
                          padding: '1rem',
                          borderRadius: 'var(--radius-md)',
                        }}
                      >
                        <h4 style={{ marginBottom: '1rem' }}>SMTP 응답 코드</h4>
                        <ul
                          data-testid="reporting-code-histogram"
                          style={{ paddingLeft: '1rem' }}
                        >
                          {reportingData.codeHistogram.length === 0 ? (
                            <li>데이터 없음</li>
                          ) : (
                            reportingData.codeHistogram.map((item, idx) => (
                              <li key={idx}>
                                <strong>{item.eventType}</strong>:{' '}
                                {item.smtpReplyCode ?? 'N/A'}{' '}
                                {item.smtpEnhancedCode
                                  ? `(${item.smtpEnhancedCode})`
                                  : ''}{' '}
                                - {item.count}건
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                      <div
                        id="reporting-card-nodes"
                        data-testid="reporting-card-nodes"
                        style={{
                          background: 'var(--bg-surface-hover)',
                          border:
                            reportingSection === 'nodes'
                              ? '2px solid var(--border-focus)'
                              : '1px solid transparent',
                          padding: '1rem',
                          borderRadius: 'var(--radius-md)',
                        }}
                      >
                        <h4 style={{ marginBottom: '1rem' }}>노드별 성과</h4>
                        <ul
                          data-testid="reporting-node-breakdown"
                          style={{ paddingLeft: '1rem' }}
                        >
                          {reportingData.nodeBreakdown.length === 0 ? (
                            <li>데이터 없음</li>
                          ) : (
                            reportingData.nodeBreakdown.map((item, idx) => (
                              <li key={idx}>
                                <strong>{item.node}</strong> ({item.eventType}):{' '}
                                {item.count}건
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {pathname === '/access-keys' && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">외부 연동 API 키</h3>
              </div>
              <div className="card-body">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void createApiKey();
                  }}
                >
                  <div className="form-group">
                    <label>라벨 (이름)</label>
                    <input
                      value={apiKeyLabel}
                      onChange={(e) => setApiKeyLabel(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>권한 (Scopes)</label>
                    <div className="flex gap-4 mt-2">
                      {['individual-send'].map((scope) => (
                        <label
                          key={scope}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            fontWeight: 400,
                          }}
                        >
                          <input
                            data-testid={`api-key-scope-${scope}`}
                            type="checkbox"
                            checked={apiKeyScopes.includes(scope)}
                            onChange={() => toggleScope(scope)}
                          />
                          {scope}
                        </label>
                      ))}
                    </div>
                  </div>
                  <button className="btn btn-primary" type="submit">
                    API 키 생성
                  </button>
                </form>
                {apiKeyError && (
                  <p className="mt-4" style={{ color: 'var(--color-error)' }}>
                    {apiKeyError}
                  </p>
                )}
                {createdApiKey && (
                  <div
                    className="mt-6 p-4"
                    style={{
                      background: 'var(--color-success-bg)',
                      color: 'var(--color-success-text)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <strong>발급된 키:</strong>{' '}
                    <span data-testid="created-api-key">{createdApiKey}</span>
                    <p
                      style={{
                        margin: '0.5rem 0 0 0',
                        fontSize: 'var(--font-sm)',
                      }}
                    >
                      * 이 키는 지금만 표시됩니다. 안전한 곳에 보관하세요.
                    </p>
                  </div>
                )}
                <div className="mt-6">
                  <h4 style={{ marginBottom: '1rem' }}>발급된 API 키 목록</h4>
                  {isLoadingApiKeys ? (
                    <p>불러오는 중...</p>
                  ) : apiKeys.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)' }}>
                      발급된 API 키가 없습니다.
                    </p>
                  ) : (
                    <div className="data-table-wrapper">
                      <table className="data-table" data-testid="api-key-list">
                        <thead>
                          <tr>
                            <th>라벨</th>
                            <th>키 Prefix</th>
                            <th>권한</th>
                            <th>마지막 사용</th>
                            <th>상태</th>
                            <th>액션</th>
                          </tr>
                        </thead>
                        <tbody>
                          {apiKeys.map((apiKey) => (
                            <tr
                              key={apiKey.id}
                              data-testid={`api-key-${apiKey.id}`}
                            >
                              <td>{apiKey.label}</td>
                              <td>{apiKey.keyPrefix}</td>
                              <td>{apiKey.scopes.join(', ') || '-'}</td>
                              <td>
                                {apiKey.lastUsedAt
                                  ? new Date(apiKey.lastUsedAt).toLocaleString()
                                  : '사용 이력 없음'}
                              </td>
                              <td>
                                <span
                                  className={`badge ${apiKey.revokedAt ? 'badge-error' : 'badge-success'}`}
                                >
                                  {apiKey.revokedAt ? '폐기됨' : '활성'}
                                </span>
                              </td>
                              <td>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  data-testid={`api-key-revoke-${apiKey.id}`}
                                  disabled={
                                    Boolean(apiKey.revokedAt) ||
                                    deletingApiKeyId === apiKey.id ||
                                    revokingApiKeyId === apiKey.id
                                  }
                                  onClick={() => void revokeApiKey(apiKey.id)}
                                  type="button"
                                >
                                  {apiKey.revokedAt
                                    ? '폐기됨'
                                    : revokingApiKeyId === apiKey.id
                                      ? '폐기 중...'
                                      : '폐기'}
                                </button>
                                <button
                                  className="btn btn-danger btn-sm ml-2"
                                  data-testid={`api-key-delete-${apiKey.id}`}
                                  disabled={
                                    deletingApiKeyId === apiKey.id ||
                                    revokingApiKeyId === apiKey.id
                                  }
                                  onClick={() => void deleteApiKey(apiKey.id)}
                                  type="button"
                                >
                                  {deletingApiKeyId === apiKey.id
                                    ? '삭제 중...'
                                    : '삭제'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
