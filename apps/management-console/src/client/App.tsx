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
  buildTemplateViewSearch,
  parseTemplateViewFromSearch,
} from './templateViewQuery';
import {
  buildReportingViewSearch,
  parseReportingViewFromSearch,
  type ReportingSection,
} from './reportingViewQuery';
import {
  buildSubscriberFiltersSearch,
  parseSubscriberFiltersFromSearch,
  type SubscriberTab,
} from './subscriberFiltersQuery';
import { filterSends } from './sendsFiltering';

// === Types ===
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
  groups: { id: string; name: string }[];
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
  audienceProvenance?: {
    manual: boolean;
    groups: Array<{ id: string; name: string }>;
  } | null;
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

type AudienceProvenanceRecord = {
  manual: boolean;
  groups: Array<{ id: string; name: string }>;
};

// === Helpers ===
const getPathname = (): string => window.location.pathname;
const getSearch = (): string => window.location.search;
const navigate = (pathname: string): void => {
  window.history.pushState({}, '', pathname);
  window.dispatchEvent(new PopStateEvent('popstate'));
};
const loadJson = async <T,>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(input, {
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

const escapeCsvValue = (value: string): string =>
  `"${value.replace(/"/g, '""')}"`;

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

  // Subscribers State
  const [subscribers, setSubscribers] = useState<SubscriberRecord[]>([]);
  const [isLoadingSubscribers, setIsLoadingSubscribers] = useState(false);
  const [subscriberEmail, setSubscriberEmail] = useState('alice@example.com');
  const [subscriberDisplayName, setSubscriberDisplayName] = useState('Alice');
  const [subscriberGroupIds, setSubscriberGroupIds] = useState<string[]>([]);
  const [subscriberFormError, setSubscriberFormError] = useState<string | null>(
    null,
  );
  const [subscriberActionError, setSubscriberActionError] = useState<
    string | null
  >(null);
  const initialSubscriberFilterState =
    parseSubscriberFiltersFromSearch(getSearch());
  const [subscriberTab, setSubscriberTab] = useState<SubscriberTab>(
    initialSubscriberFilterState.tab,
  );
  const [editingSubscriber, setEditingSubscriber] =
    useState<SubscriberRecord | null>(null);

  // Groups State
  const [subscriberGroups, setSubscriberGroups] = useState<
    { id: string; name: string }[]
  >([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [groupActionError, setGroupActionError] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  // Sync State
  const [syncSourceKey, setSyncSourceKey] = useState('crm');
  const [syncEndpointUrl, setSyncEndpointUrl] = useState('');
  const [syncRuns, setSyncRuns] = useState<SyncRunRecord[]>([]);
  const [isLoadingSyncRuns, setIsLoadingSyncRuns] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // API Key State
  const [apiKeyLabel, setApiKeyLabel] = useState('Playwright Key');
  const initialApiKeyViewState = parseApiKeyViewFromSearch(getSearch());
  const [apiKeyScopes, setApiKeyScopes] = useState<string[]>(
    initialApiKeyViewState.scopes,
  );
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  // Templates State
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [hasLoadedTemplates, setHasLoadedTemplates] = useState(false);
  const [templateFormError, setTemplateFormError] = useState<string | null>(
    null,
  );
  const [templateFormSuccess, setTemplateFormSuccess] = useState<string | null>(
    null,
  );
  const initialTemplateViewState = parseTemplateViewFromSearch(getSearch());
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    initialTemplateViewState.templateId,
  );
  const [templateName, setTemplateName] = useState('');
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateHtml, setTemplateHtml] = useState('');
  const [previewDataStr, setPreviewDataStr] = useState(
    '{\n  "firstName": "Alice",\n  "company": "Acme Corp"\n}',
  );
  const [previewSubject, setPreviewSubject] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

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
  const [routingFormError, setRoutingFormError] = useState<string | null>(null);
  const [routingFormSuccess, setRoutingFormSuccess] = useState<string | null>(
    null,
  );
  const [routingLoadError, setRoutingLoadError] = useState<string | null>(null);
  const [previewRecipientEmail, setPreviewRecipientEmail] = useState('');
  const [previewRouteResult, setPreviewRouteResult] = useState<{
    rule: RoutingRuleRecord;
    node: SendSmtpNodeRecord;
  } | null>(null);
  const [previewRouteError, setPreviewRouteError] = useState<string | null>(
    null,
  );

  // Sends State
  const [sends, setSends] = useState<SendRecord[]>([]);
  const [sendFlowError, setSendFlowError] = useState<string | null>(null);
  const [individualTo, setIndividualTo] = useState('alice@example.com');
  const [individualTemplateId, setIndividualTemplateId] = useState('');
  const [individualWebhookUrl, setIndividualWebhookUrl] = useState(
    'http://localhost:4010/webhooks/result',
  );
  const [campaignRecipients, setCampaignRecipients] = useState(
    'bob@gmail.com\nhardbounce@example.com',
  );
  const [campaignTemplateId, setCampaignTemplateId] = useState('');
  const [campaignGroupIds, setCampaignGroupIds] = useState<string[]>([]);
  const initialSendFilterState = parseSendFiltersFromSearch(getSearch());
  const [sendRecipientQuery, setSendRecipientQuery] = useState(
    initialSendFilterState.recipientQuery,
  );
  const [sendProvenanceFilter, setSendProvenanceFilter] =
    useState<SendProvenanceFilter>(initialSendFilterState.provenanceFilter);

  // Sends Detailed View State
  const [selectedSendId, setSelectedSendId] = useState<string | null>(null);
  const [sendEvents, setSendEvents] = useState<DeliveryEventRecord[]>([]);
  const [sendEventsError, setSendEventsError] = useState<string | null>(null);
  const [sendAudienceProvenance, setSendAudienceProvenance] =
    useState<AudienceProvenanceRecord | null>(null);
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

  useEffect(() => {
    const handlePopState = () => {
      setPathname(getPathname());
      setLocationSearch(getSearch());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (pathname !== '/subscribers') {
      return;
    }

    const parsed = parseSubscriberFiltersFromSearch(locationSearch);
    setSubscriberTab(parsed.tab);
  }, [pathname, locationSearch]);

  useEffect(() => {
    if (pathname !== '/subscribers') {
      return;
    }

    const nextSearch = buildSubscriberFiltersSearch({ tab: subscriberTab });

    if (nextSearch === locationSearch) {
      return;
    }

    window.history.replaceState({}, '', `${pathname}${nextSearch}`);
    setLocationSearch(nextSearch);
  }, [locationSearch, pathname, subscriberTab]);

  useEffect(() => {
    if (pathname !== '/sends') {
      return;
    }

    const parsed = parseSendFiltersFromSearch(locationSearch);
    setSendRecipientQuery(parsed.recipientQuery);
    setSendProvenanceFilter(parsed.provenanceFilter);
  }, [pathname, locationSearch]);

  useEffect(() => {
    if (pathname !== '/templates') {
      return;
    }

    const parsed = parseTemplateViewFromSearch(locationSearch);

    if (!parsed.templateId) {
      setEditingTemplateId(null);
      setTemplateName('');
      setTemplateSubject('');
      setTemplateHtml('');
      return;
    }

    const matchedTemplate = templates.find(
      (template) => template.id === parsed.templateId,
    );

    if (!matchedTemplate) {
      if (hasLoadedTemplates) {
        setEditingTemplateId(null);
      }
      return;
    }

    setEditingTemplateId(matchedTemplate.id);
    setTemplateName(matchedTemplate.name);
    setTemplateSubject(matchedTemplate.subject);
    setTemplateHtml(matchedTemplate.html);
  }, [hasLoadedTemplates, locationSearch, pathname, templates]);

  useEffect(() => {
    if (pathname !== '/reporting') {
      return;
    }

    const parsed = parseReportingViewFromSearch(locationSearch);
    setReportingSection(parsed.section);
  }, [locationSearch, pathname]);

  useEffect(() => {
    if (pathname !== '/routing') {
      return;
    }

    const parsed = parseRoutingViewFromSearch(locationSearch);
    setRoutingSection(parsed.section);
  }, [locationSearch, pathname]);

  useEffect(() => {
    if (pathname !== '/access-keys') {
      return;
    }

    const parsed = parseApiKeyViewFromSearch(locationSearch);
    setApiKeyScopes(parsed.scopes);
  }, [locationSearch, pathname]);

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

  // Loaders
  useEffect(() => {
    if (
      session.status !== 'authenticated' ||
      (pathname !== '/subscribers' && pathname !== '/sends')
    )
      return;
    const loadSubscribers = async () => {
      setIsLoadingSubscribers(true);
      try {
        const payload = await loadJson<{ data: SubscriberRecord[] }>(
          '/api/subscribers',
        );
        setSubscribers(payload.data);
      } finally {
        setIsLoadingSubscribers(false);
      }
    };
    const loadGroups = async () => {
      setIsLoadingGroups(true);
      try {
        const payload = await loadJson<{
          data: { id: string; name: string }[];
        }>('/api/subscriber-groups');
        setSubscriberGroups(payload.data);
      } finally {
        setIsLoadingGroups(false);
      }
    };
    const loadSyncRuns = async () => {
      if (pathname !== '/subscribers') {
        return;
      }

      setIsLoadingSyncRuns(true);
      try {
        const payload = await loadJson<{ data: SyncRunRecord[] }>(
          '/api/sync-runs',
        );
        setSyncRuns(payload.data);
      } finally {
        setIsLoadingSyncRuns(false);
      }
    };
    void loadSubscribers();
    void loadGroups();
    void loadSyncRuns();
  }, [pathname, session.status]);

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
    if (
      session.status !== 'authenticated' ||
      (pathname !== '/templates' && pathname !== '/sends')
    )
      return;
    const loadTemplates = async () => {
      setIsLoadingTemplates(true);
      try {
        const payload = await loadJson<{ data: TemplateRecord[] }>(
          '/api/templates',
        );
        setTemplates(payload.data);
      } finally {
        setIsLoadingTemplates(false);
        setHasLoadedTemplates(true);
      }
    };
    void loadTemplates();
  }, [pathname, session.status]);

  useEffect(() => {
    if (session.status !== 'authenticated' || pathname !== '/sends') return;
    const loadSendFlowData = async () => {
      setSendFlowError(null);
      try {
        const sendsRes = await loadJson<{ data: SendRecord[] }>('/api/sends');
        setSends(sendsRes.data);
      } catch (error) {
        setSendFlowError(
          error instanceof Error ? error.message : 'Failed to load sends',
        );
      }
    };
    void loadSendFlowData();
  }, [pathname, session.status]);

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
    }).catch(() => undefined);
    setSession({ status: 'unauthenticated' });
    navigate('/login');
  };

  // Subscriber Actions
  const refreshSubscribers = async () => {
    const p = await loadJson<{ data: SubscriberRecord[] }>('/api/subscribers');
    setSubscribers(p.data);
  };
  const refreshSyncRuns = async () => {
    const p = await loadJson<{ data: SyncRunRecord[] }>('/api/sync-runs');
    setSyncRuns(p.data);
  };

  const refreshGroups = async () => {
    const p = await loadJson<{ data: { id: string; name: string }[] }>(
      '/api/subscriber-groups',
    );
    setSubscriberGroups(p.data);
  };
  const [groupName, setGroupName] = useState('');
  const createOrUpdateGroup = async () => {
    setGroupActionError(null);
    try {
      if (editingGroupId) {
        await loadJson(`/api/subscriber-groups/${editingGroupId}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: groupName }),
        });
      } else {
        await loadJson('/api/subscriber-groups', {
          method: 'POST',
          body: JSON.stringify({ name: groupName }),
        });
      }
      await refreshGroups();
      setGroupName('');
      setEditingGroupId(null);
    } catch (e) {
      setGroupActionError(e instanceof Error ? e.message : 'Failed');
    }
  };
  const deleteGroup = async (groupId: string) => {
    if (
      !window.confirm(
        '정말 이 그룹을 삭제하시겠습니까? (구독자는 삭제되지 않습니다)',
      )
    )
      return;
    setGroupActionError(null);
    try {
      await loadJson(`/api/subscriber-groups/${groupId}`, {
        method: 'DELETE',
      });
      await refreshGroups();
    } catch (e) {
      setGroupActionError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const createSubscriber = async () => {
    setSubscriberFormError(null);
    try {
      if (editingSubscriber) {
        await loadJson(`/api/subscribers/${editingSubscriber.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            email: subscriberEmail,
            displayName: subscriberDisplayName,
          }),
        });
      } else {
        await loadJson('/api/subscribers', {
          method: 'POST',
          body: JSON.stringify({
            email: subscriberEmail,
            displayName: subscriberDisplayName,
          }),
        });
      }

      if (editingSubscriber) {
        await loadJson(`/api/subscribers/${editingSubscriber.id}/groups`, {
          method: 'PUT',
          body: JSON.stringify({
            groupIds: subscriberGroupIds,
          }),
        });
      }

      await refreshSubscribers();
      setSubscriberGroupIds([]);
      setSubscriberEmail('');
      setSubscriberDisplayName('');
      setEditingSubscriber(null);
    } catch (e) {
      setSubscriberFormError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const deleteSubscriber = async (subscriberId: string) => {
    if (
      !window.confirm(
        '정말 이 구독자를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
      )
    )
      return;
    setSubscriberActionError(null);
    try {
      await loadJson(`/api/subscribers/${subscriberId}`, {
        method: 'DELETE',
      });
      await refreshSubscribers();
    } catch (e) {
      setSubscriberActionError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const toggleSubscriberUnsubscribed = async (s: SubscriberRecord) => {
    try {
      await loadJson(`/api/subscribers/${s.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ unsubscribed: !s.isUnsubscribed }),
      });
      await refreshSubscribers();
    } catch (e) {
      setSubscriberActionError(e instanceof Error ? e.message : 'Failed');
    }
  };
  const addHardBounceSuppression = async (s: SubscriberRecord) => {
    try {
      await loadJson(`/api/subscribers/${s.id}/suppressions`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'hard_bounce' }),
      });
      await refreshSubscribers();
    } catch (e) {
      setSubscriberActionError(e instanceof Error ? e.message : 'Failed');
    }
  };
  const runSync = async () => {
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
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const startEditingSubscriber = (subscriber: SubscriberRecord) => {
    setSubscriberFormError(null);
    setEditingSubscriber(subscriber);
    setSubscriberEmail(subscriber.email);
    setSubscriberDisplayName(subscriber.displayName ?? '');
    setSubscriberGroupIds(
      subscriber.groups ? subscriber.groups.map((g) => g.id) : [],
    );
    document.getElementById('add-subscriber-form')?.scrollIntoView({
      behavior: 'smooth',
    });
  };

  const cancelEditingSubscriber = () => {
    setEditingSubscriber(null);
    setSubscriberEmail('alice@example.com');
    setSubscriberDisplayName('Alice');
    setSubscriberGroupIds([]);
    setSubscriberFormError(null);
  };

  const downloadSubscribersCsv = () => {
    const rows = [
      [
        'email',
        'displayName',
        'groups',
        'status',
        'eligible',
        'isUnsubscribed',
        'suppressionReasons',
        'lastSyncedAt',
      ],
      ...filteredSubscribers.map((subscriber) => [
        subscriber.email,
        subscriber.displayName ?? '',
        subscriber.groups.map((group) => group.name).join('|'),
        subscriber.status,
        subscriber.eligible ? 'true' : 'false',
        subscriber.isUnsubscribed ? 'true' : 'false',
        subscriber.suppressionReasons.join('|'),
        subscriber.lastSyncedAt ?? '',
      ]),
    ];

    const csv = rows
      .map((row) => row.map((value) => escapeCsvValue(value)).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `subscribers-${subscriberTab}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
      const p = await loadJson<{ data: { rawKey: string } }>('/api/api-keys', {
        method: 'POST',
        body: JSON.stringify({ label: apiKeyLabel, scopes: apiKeyScopes }),
      });
      setCreatedApiKey(p.data.rawKey);
    } catch (e) {
      setApiKeyError(e instanceof Error ? e.message : 'Failed');
    }
  };

  // Template Actions
  const refreshTemplates = async () => {
    const p = await loadJson<{ data: TemplateRecord[] }>('/api/templates');
    setTemplates(p.data);
  };
  const saveTemplate = async () => {
    setTemplateFormError(null);
    setTemplateFormSuccess(null);
    try {
      const body = JSON.stringify({
        name: templateName,
        subject: templateSubject,
        html: templateHtml,
      });
      if (editingTemplateId) {
        await loadJson(`/api/templates/${editingTemplateId}`, {
          method: 'PATCH',
          body,
        });
      } else {
        await loadJson('/api/templates', { method: 'POST', body });
      }
      setTemplateFormSuccess('저장되었습니다.');
      await refreshTemplates();
      if (!editingTemplateId) {
        setTemplateName('');
        setTemplateSubject('');
        setTemplateHtml('');
      }
    } catch (e) {
      setTemplateFormError(e instanceof Error ? e.message : 'Failed');
    }
  };
  const renderPreview = async () => {
    setPreviewError(null);
    setIsPreviewing(true);
    try {
      const previewData = JSON.parse(previewDataStr);
      const p = await loadJson<{ data: { subject: string; html: string } }>(
        '/api/templates/preview',
        {
          method: 'POST',
          body: JSON.stringify({
            subject: templateSubject,
            html: templateHtml,
            previewData,
          }),
        },
      );
      setPreviewSubject(p.data.subject);
      setPreviewHtml(p.data.html);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setIsPreviewing(false);
    }
  };

  // Routing Actions
  const createSmtpNode = async () => {
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
        priority: 100,
        isActive: true,
      },
    ]);
  const updateRule = (index: number, updates: Partial<RoutingRuleRecord>) => {
    const newRules = [...routingRules];
    newRules[index] = { ...newRules[index], ...updates };
    setRoutingRules(newRules);
  };
  const removeRule = (index: number) =>
    setRoutingRules(routingRules.filter((_, i) => i !== index));
  const previewRoute = async () => {
    setPreviewRouteError(null);
    try {
      const res = await loadJson<{
        data: { rule: RoutingRuleRecord; node: SendSmtpNodeRecord } | null;
      }>('/api/routing-rules/preview', {
        method: 'POST',
        body: JSON.stringify({ recipientEmail: previewRecipientEmail }),
      });
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
    setSendAudienceProvenance(null);
    setSendWebhookDelivery(null);
    try {
      const res = await loadJson<{
        data: DeliveryEventRecord[];
        audienceProvenance: AudienceProvenanceRecord | null;
        webhookDelivery: WebhookDeliveryRecord | null;
      }>(`/api/admin/sends/${sendId}/delivery-events`);
      setSendEvents(res.data);
      setSendAudienceProvenance(res.audienceProvenance);
      setSendWebhookDelivery(res.webhookDelivery);
    } catch (e) {
      setSendEventsError(e instanceof Error ? e.message : 'Failed');
    }
  };

  // Filtered Subscribers
  const filteredSubscribers = subscribers.filter((s) => {
    if (subscriberTab === 'all') return true;
    if (subscriberTab === 'eligible') return s.eligible && !s.isUnsubscribed;
    if (subscriberTab === 'unsubscribed') return s.isUnsubscribed;
    if (subscriberTab === 'suppressed') return s.suppressionReasons.length > 0;
    return true;
  });

  const allCount = subscribers.length;
  const eligibleCount = subscribers.filter(
    (s) => s.eligible && !s.isUnsubscribed,
  ).length;
  const unsubCount = subscribers.filter((s) => s.isUnsubscribed).length;
  const suppCount = subscribers.filter(
    (s) => s.suppressionReasons.length > 0,
  ).length;
  const sendTotalCount = sends.length;
  const sendIndividualCount = sends.filter(
    (send) => send.kind === 'individual',
  ).length;
  const sendCampaignCount = sends.filter(
    (send) => send.kind === 'campaign',
  ).length;
  const sendDeliveredCount = sends.filter(
    (send) => send.status === 'delivered',
  ).length;
  const sendAttentionCount = sends.filter((send) =>
    ['bounced', 'deferred'].includes(send.status),
  ).length;
  const selectedCampaignAudience = Array.from(
    new Map(
      subscribers
        .filter((subscriber) =>
          subscriber.groups.some((group) =>
            campaignGroupIds.includes(group.id),
          ),
        )
        .map((subscriber) => [subscriber.email, subscriber]),
    ).values(),
  );
  const selectedCampaignAudienceEligibleCount = selectedCampaignAudience.filter(
    (subscriber) => subscriber.eligible,
  ).length;
  const selectedCampaignAudienceAttentionCount =
    selectedCampaignAudience.length - selectedCampaignAudienceEligibleCount;
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
    });

    if (nextSearch === locationSearch) {
      return;
    }

    window.history.replaceState({}, '', `${pathname}${nextSearch}`);
    setLocationSearch(nextSearch);
  }, [locationSearch, pathname, sendProvenanceFilter, sendRecipientQuery]);

  useEffect(() => {
    if (pathname !== '/templates') {
      return;
    }

    const nextSearch = buildTemplateViewSearch({
      templateId: editingTemplateId,
    });

    if (nextSearch === locationSearch) {
      return;
    }

    window.history.replaceState({}, '', `${pathname}${nextSearch}`);
    setLocationSearch(nextSearch);
  }, [editingTemplateId, locationSearch, pathname]);

  useEffect(() => {
    if (pathname !== '/reporting') {
      return;
    }

    const nextSearch = buildReportingViewSearch({
      section: reportingSection,
    });

    if (nextSearch === locationSearch) {
      return;
    }

    window.history.replaceState({}, '', `${pathname}${nextSearch}`);
    setLocationSearch(nextSearch);
  }, [locationSearch, pathname, reportingSection]);

  useEffect(() => {
    if (pathname !== '/routing') {
      return;
    }

    const nextSearch = buildRoutingViewSearch({ section: routingSection });

    if (nextSearch === locationSearch) {
      return;
    }

    window.history.replaceState({}, '', `${pathname}${nextSearch}`);
    setLocationSearch(nextSearch);
  }, [locationSearch, pathname, routingSection]);

  useEffect(() => {
    if (pathname !== '/access-keys') {
      return;
    }

    const nextSearch = buildApiKeyViewSearch({
      scopes: apiKeyScopes.filter(
        (
          scope,
        ): scope is 'subscriber-sync' | 'individual-send' | 'campaign-send' =>
          ['subscriber-sync', 'individual-send', 'campaign-send'].includes(
            scope,
          ),
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
      setSendAudienceProvenance(null);
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
            className={`nav-item ${pathname === '/subscribers' ? 'active' : ''}`}
            onClick={() => navigate('/subscribers')}
          >
            구독자 관리 (Subscribers)
          </button>
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
            className={`nav-item secondary ${pathname === '/templates' ? 'active' : ''}`}
            onClick={() => navigate('/templates')}
          >
            템플릿 관리 (Templates)
          </button>
          <button
            className={`nav-item secondary ${pathname === '/routing' ? 'active' : ''}`}
            onClick={() => navigate('/routing')}
          >
            라우팅 설정 (Routing)
          </button>
          <button
            className={`nav-item secondary ${pathname === '/reporting' ? 'active' : ''}`}
            onClick={() => navigate('/reporting')}
          >
            리포트 (Reporting)
          </button>
          <button
            className={`nav-item secondary ${pathname === '/access-keys' ? 'active' : ''}`}
            onClick={() => navigate('/access-keys')}
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
          {pathname === '/subscribers' && (
            <div>
              <div className="page-header">
                <h1 className="page-title">구독자 관리</h1>
                <div className="flex gap-2">
                  <button
                    className="btn btn-secondary"
                    onClick={downloadSubscribersCsv}
                  >
                    CSV 다운로드
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      document
                        .getElementById('add-subscriber-form')
                        ?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    + 신규 구독자
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-4 mb-6">
                <button
                  className="stat-card stat-button"
                  data-testid="subscriber-tab-all"
                  onClick={() => setSubscriberTab('all')}
                  type="button"
                >
                  <div className="stat-title">전체 구독자</div>
                  <div className="stat-value">{allCount}</div>
                </button>
                <button
                  className="stat-card stat-button"
                  data-testid="subscriber-tab-eligible"
                  onClick={() => setSubscriberTab('eligible')}
                  type="button"
                >
                  <div
                    className="stat-title"
                    style={{ color: 'var(--color-success)' }}
                  >
                    발송 가능
                  </div>
                  <div className="stat-value">{eligibleCount}</div>
                </button>
                <button
                  className="stat-card stat-button"
                  data-testid="subscriber-tab-unsubscribed"
                  onClick={() => setSubscriberTab('unsubscribed')}
                  type="button"
                >
                  <div
                    className="stat-title"
                    style={{ color: 'var(--color-warning)' }}
                  >
                    수신 거부
                  </div>
                  <div className="stat-value">{unsubCount}</div>
                </button>
                <button
                  className="stat-card stat-button"
                  data-testid="subscriber-tab-suppressed"
                  onClick={() => setSubscriberTab('suppressed')}
                  type="button"
                >
                  <div
                    className="stat-title"
                    style={{ color: 'var(--color-error)' }}
                  >
                    발송 억제됨
                  </div>
                  <div className="stat-value">{suppCount}</div>
                </button>
              </div>

              <div className="card">
                <div
                  className="card-header flex"
                  style={{
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <h3 className="card-title">구독자 그룹 관리</h3>
                </div>
                <div className="card-body">
                  <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
                    상태 탭은 발송 가능 여부를 빠르게 보는 용도이고, 그룹은
                    운영자가 직접 만든 관리용 묶음입니다.
                  </p>
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      aria-label="새 그룹 이름"
                      placeholder="새 그룹 이름"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={createOrUpdateGroup}
                      type="button"
                    >
                      {editingGroupId ? '그룹 수정' : '그룹 추가'}
                    </button>
                    {editingGroupId && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setEditingGroupId(null);
                          setGroupName('');
                        }}
                        type="button"
                      >
                        취소
                      </button>
                    )}
                  </div>
                  {groupActionError && (
                    <p style={{ color: 'var(--color-error)' }}>
                      {groupActionError}
                    </p>
                  )}
                  {isLoadingGroups ? (
                    <p style={{ color: 'var(--text-secondary)' }}>
                      그룹을 불러오는 중...
                    </p>
                  ) : null}

                  <div className="flex gap-2 flex-wrap">
                    {subscriberGroups.length === 0 ? (
                      <span
                        style={{
                          color: 'var(--text-secondary)',
                          fontSize: 'var(--font-sm)',
                        }}
                      >
                        등록된 그룹이 없습니다.
                      </span>
                    ) : (
                      subscriberGroups.map((g) => (
                        <div
                          key={g.id}
                          className="badge badge-neutral flex gap-2 items-center"
                          data-testid={`subscriber-group-${g.id}`}
                        >
                          {g.name}
                          <button
                            aria-label={`${g.name} 그룹 수정`}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 0,
                            }}
                            onClick={() => {
                              setEditingGroupId(g.id);
                              setGroupName(g.name);
                            }}
                            type="button"
                          >
                            ✏️
                          </button>
                          <button
                            aria-label={`${g.name} 그룹 삭제`}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 0,
                              color: 'var(--color-error)',
                            }}
                            onClick={() => deleteGroup(g.id)}
                            type="button"
                          >
                            ✕
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div
                    className="tabs"
                    style={{
                      marginBottom: 0,
                      borderBottom: 'none',
                      gap: '1rem',
                    }}
                  >
                    <button
                      className={`tab ${subscriberTab === 'all' ? 'active' : ''}`}
                      onClick={() => setSubscriberTab('all')}
                    >
                      전체 (All)
                    </button>
                    <button
                      className={`tab ${subscriberTab === 'eligible' ? 'active' : ''}`}
                      onClick={() => setSubscriberTab('eligible')}
                    >
                      발송 가능 (Eligible)
                    </button>
                    <button
                      className={`tab ${subscriberTab === 'unsubscribed' ? 'active' : ''}`}
                      onClick={() => setSubscriberTab('unsubscribed')}
                    >
                      수신 거부 (Unsubscribed)
                    </button>
                    <button
                      className={`tab ${subscriberTab === 'suppressed' ? 'active' : ''}`}
                      onClick={() => setSubscriberTab('suppressed')}
                    >
                      억제됨 (Suppressed)
                    </button>
                  </div>
                  <div>
                    <button
                      className="btn btn-danger btn-sm"
                      disabled
                      title="백엔드 삭제 기능 미지원"
                    >
                      선택 삭제
                    </button>
                  </div>
                </div>
                {subscriberActionError && (
                  <p style={{ color: 'var(--color-error)' }}>
                    {subscriberActionError}
                  </p>
                )}
                <div className="data-table-wrapper">
                  <table className="data-table" data-testid="subscriber-list">
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>
                          <input
                            type="checkbox"
                            disabled
                            title="선택 기능 미지원"
                          />
                        </th>
                        <th>이메일 / 이름</th>
                        <th>상태</th>
                        <th>최근 동기화</th>
                        <th>액션</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoadingSubscribers && (
                        <tr>
                          <td
                            colSpan={5}
                            className="text-center"
                            style={{ padding: '2rem' }}
                          >
                            로딩 중...
                          </td>
                        </tr>
                      )}
                      {!isLoadingSubscribers &&
                        filteredSubscribers.length === 0 && (
                          <tr>
                            <td
                              colSpan={5}
                              className="text-center"
                              style={{ padding: '2rem' }}
                            >
                              데이터가 없습니다.
                            </td>
                          </tr>
                        )}
                      {filteredSubscribers.map((s) => (
                        <tr key={s.id} data-testid={`subscriber-${s.email}`}>
                          <td>
                            <input type="checkbox" disabled />
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{s.email}</div>
                            <div
                              style={{
                                fontSize: 'var(--font-xs)',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {s.displayName || '-'}
                            </div>
                          </td>
                          <td>
                            <div className="flex gap-2">
                              {s.eligible && !s.isUnsubscribed ? (
                                <span className="badge badge-success">
                                  발송 가능
                                </span>
                              ) : null}
                              {s.isUnsubscribed ? (
                                <span className="badge badge-warning">
                                  수신 거부
                                </span>
                              ) : null}
                              {s.suppressionReasons.length > 0 ? (
                                <span className="badge badge-error">
                                  억제됨 ({s.suppressionReasons.join(',')})
                                </span>
                              ) : null}
                              {!s.eligible &&
                              !s.isUnsubscribed &&
                              s.suppressionReasons.length === 0 ? (
                                <span className="badge badge-neutral">
                                  {s.eligibilityReason || '불가'}
                                </span>
                              ) : null}
                              {s.groups && s.groups.length > 0
                                ? s.groups.map((g) => (
                                    <span
                                      key={g.id}
                                      className="badge badge-info"
                                    >
                                      {g.name}
                                    </span>
                                  ))
                                : null}
                            </div>
                          </td>
                          <td>
                            {s.lastSyncedAt
                              ? new Date(s.lastSyncedAt).toLocaleString()
                              : '없음'}
                          </td>
                          <td>
                            <div className="flex gap-2">
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() =>
                                  void toggleSubscriberUnsubscribed(s)
                                }
                              >
                                {s.isUnsubscribed
                                  ? '재구독 처리'
                                  : '수신거부 처리'}
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => void addHardBounceSuppression(s)}
                              >
                                하드바운스 처리
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => startEditingSubscriber(s)}
                              >
                                정보 수정
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => void deleteSubscriber(s.id)}
                                type="button"
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-2">
                <div className="card" id="add-subscriber-form">
                  <div className="card-header">
                    <h3 className="card-title">
                      {editingSubscriber
                        ? '구독자 정보 수정'
                        : '신규 구독자 추가'}
                    </h3>
                  </div>
                  <div className="card-body">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void createSubscriber();
                      }}
                    >
                      <div className="form-group">
                        <label>이메일</label>
                        <input
                          data-testid="subscriber-email-input"
                          value={subscriberEmail}
                          onChange={(e) => setSubscriberEmail(e.target.value)}
                          type="email"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>이름 (표시명)</label>
                        <input
                          data-testid="subscriber-display-name-input"
                          value={subscriberDisplayName}
                          onChange={(e) =>
                            setSubscriberDisplayName(e.target.value)
                          }
                        />
                      </div>
                      {editingSubscriber && subscriberGroups.length > 0 && (
                        <div className="form-group">
                          <label>소속 그룹</label>
                          <div
                            className="flex flex-col gap-2"
                            style={{
                              maxHeight: '150px',
                              overflowY: 'auto',
                              padding: '0.5rem',
                              border: '1px solid var(--border-light)',
                              borderRadius: '4px',
                            }}
                          >
                            {subscriberGroups.map((g) => (
                              <label
                                key={g.id}
                                className="flex gap-2 items-center"
                                style={{ margin: 0, fontWeight: 'normal' }}
                              >
                                <input
                                  aria-label={`${g.name} 그룹 선택`}
                                  type="checkbox"
                                  checked={subscriberGroupIds.includes(g.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSubscriberGroupIds([
                                        ...subscriberGroupIds,
                                        g.id,
                                      ]);
                                    } else {
                                      setSubscriberGroupIds(
                                        subscriberGroupIds.filter(
                                          (id) => id !== g.id,
                                        ),
                                      );
                                    }
                                  }}
                                />
                                {g.name}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button className="btn btn-primary" type="submit">
                          {editingSubscriber ? '수정 저장' : '추가하기'}
                        </button>
                        {editingSubscriber ? (
                          <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={cancelEditingSubscriber}
                          >
                            취소
                          </button>
                        ) : null}
                      </div>
                      {subscriberFormError && (
                        <p
                          className="mt-4"
                          style={{ color: 'var(--color-error)' }}
                        >
                          {subscriberFormError}
                        </p>
                      )}
                    </form>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">구독자 동기화 (Sync)</h3>
                  </div>
                  <div className="card-body">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void runSync();
                      }}
                    >
                      <div className="form-group">
                        <label>소스 키</label>
                        <input
                          value={syncSourceKey}
                          onChange={(e) => setSyncSourceKey(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>엔드포인트 URL</label>
                        <input
                          data-testid="subscriber-sync-endpoint-input"
                          value={syncEndpointUrl}
                          onChange={(e) => setSyncEndpointUrl(e.target.value)}
                          required
                        />
                      </div>
                      <button className="btn btn-secondary" type="submit">
                        동기화 실행
                      </button>
                      {syncError && (
                        <p
                          className="mt-4"
                          style={{ color: 'var(--color-error)' }}
                        >
                          {syncError}
                        </p>
                      )}
                    </form>
                    <hr />
                    <h4>최근 동기화 이력</h4>
                    {isLoadingSyncRuns && <p>로딩 중...</p>}
                    <ul
                      style={{
                        paddingLeft: '1rem',
                        fontSize: 'var(--font-sm)',
                      }}
                      data-testid="sync-run-list"
                    >
                      {syncRuns.slice(0, 3).map((run) => (
                        <li key={run.id} style={{ marginBottom: '0.5rem' }}>
                          <strong>{run.sourceKey}</strong> - {run.status} <br />
                          <span style={{ color: 'var(--text-secondary)' }}>
                            처리: {run.stats?.processed || 0} / 생성:{' '}
                            {run.stats?.created || 0} / 실패:{' '}
                            {run.stats?.failed || 0}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {pathname === '/sends' && (
            <div>
              <div className="page-header">
                <h1 className="page-title">발송 관리</h1>
              </div>

              <div className="grid grid-cols-5 mb-6">
                <div className="stat-card">
                  <div className="stat-title">전체 발송</div>
                  <div className="stat-value">{sendTotalCount}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-title">개별 발송</div>
                  <div className="stat-value">{sendIndividualCount}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-title">대상 발송</div>
                  <div className="stat-value">{sendCampaignCount}</div>
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

              <div className="card">
                <div className="card-body">
                  <strong>발송 목록 안내</strong>
                  <p
                    style={{
                      margin: '0.5rem 0 0 0',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    개별 발송과 대상 발송을 하나의 목록으로 보고, 각 행에서 배달
                    이벤트와 웹훅 결과를 바로 확인할 수 있습니다.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 mb-6">
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">개별 메일 발송 (Individual)</h3>
                  </div>
                  <div className="card-body">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void (async () => {
                          setSendFlowError(null);
                          try {
                            await loadJson('/api/admin/individual-sends', {
                              method: 'POST',
                              body: JSON.stringify({
                                to: individualTo,
                                templateId: individualTemplateId || undefined,
                                webhookUrl: individualWebhookUrl,
                                variables: { firstName: 'User' },
                              }),
                            });
                            const sendsRes = await loadJson<{
                              data: SendRecord[];
                            }>('/api/sends');
                            setSends(sendsRes.data);
                          } catch (err) {
                            setSendFlowError(
                              err instanceof Error ? err.message : 'Failed',
                            );
                          }
                        })();
                      }}
                    >
                      <div className="form-group">
                        <label>수신자 이메일</label>
                        <input
                          data-testid="individual-send-to"
                          value={individualTo}
                          onChange={(e) => setIndividualTo(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>템플릿</label>
                        <select
                          data-testid="individual-send-template"
                          value={individualTemplateId}
                          onChange={(e) =>
                            setIndividualTemplateId(e.target.value)
                          }
                        >
                          <option value="">선택 안함</option>
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>결과 웹훅 URL</label>
                        <input
                          data-testid="individual-send-webhook"
                          value={individualWebhookUrl}
                          onChange={(e) =>
                            setIndividualWebhookUrl(e.target.value)
                          }
                        />
                      </div>
                      <button className="btn btn-primary" type="submit">
                        개별 발송하기
                      </button>
                    </form>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">캠페인 발송 큐잉 (Campaign)</h3>
                  </div>
                  <div className="card-body">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void (async () => {
                          setSendFlowError(null);
                          try {
                            await loadJson('/api/admin/campaign-sends', {
                              method: 'POST',
                              body: JSON.stringify({
                                templateId: campaignTemplateId || undefined,
                                recipients: campaignRecipients
                                  .split(/\s+/)
                                  .map((v) => v.trim())
                                  .filter((v) => v.length > 0),
                                groupIds: campaignGroupIds,
                                variables: { firstName: 'Campaign' },
                              }),
                            });
                            const sendsRes = await loadJson<{
                              data: SendRecord[];
                            }>('/api/sends');
                            setSends(sendsRes.data);
                          } catch (err) {
                            setSendFlowError(
                              err instanceof Error ? err.message : 'Failed',
                            );
                          }
                        })();
                      }}
                    >
                      <div className="form-group">
                        <label>템플릿</label>
                        <select
                          data-testid="campaign-send-template"
                          value={campaignTemplateId}
                          onChange={(e) =>
                            setCampaignTemplateId(e.target.value)
                          }
                        >
                          <option value="">선택 안함</option>
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>저장 그룹 선택</label>
                        <div
                          data-testid="campaign-send-groups"
                          className="flex flex-col gap-2"
                          style={{
                            maxHeight: '160px',
                            overflowY: 'auto',
                            padding: '0.75rem',
                            border: '1px solid var(--border-light)',
                            borderRadius: '12px',
                            background: 'var(--bg-surface-alt)',
                          }}
                        >
                          {subscriberGroups.length === 0 ? (
                            <span style={{ color: 'var(--text-secondary)' }}>
                              먼저 구독자 화면에서 그룹을 만들어 주세요.
                            </span>
                          ) : (
                            subscriberGroups.map((group) => (
                              <label
                                key={group.id}
                                className="flex gap-2 items-center"
                                style={{ margin: 0, fontWeight: 'normal' }}
                              >
                                <input
                                  aria-label={`${group.name} 발송 그룹 선택`}
                                  type="checkbox"
                                  checked={campaignGroupIds.includes(group.id)}
                                  onChange={(event) => {
                                    if (event.target.checked) {
                                      setCampaignGroupIds([
                                        ...campaignGroupIds,
                                        group.id,
                                      ]);
                                      return;
                                    }

                                    setCampaignGroupIds(
                                      campaignGroupIds.filter(
                                        (groupId) => groupId !== group.id,
                                      ),
                                    );
                                  }}
                                />
                                <span>{group.name}</span>
                              </label>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="form-group">
                        <label>수신자 목록 (줄바꿈으로 구분)</label>
                        <textarea
                          data-testid="campaign-send-recipients"
                          rows={4}
                          value={campaignRecipients}
                          onChange={(e) =>
                            setCampaignRecipients(e.target.value)
                          }
                        />
                        <p
                          style={{
                            color: 'var(--text-secondary)',
                            marginBottom: 0,
                          }}
                        >
                          직접 입력과 저장 그룹을 함께 사용할 수 있습니다. 중복
                          주소는 한 번만 발송합니다.
                        </p>
                      </div>
                      <div
                        className="card"
                        data-testid="campaign-audience-preview"
                      >
                        <div className="card-body">
                          <strong>예상 그룹 대상자</strong>
                          <p
                            style={{
                              margin: '0.5rem 0 0 0',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            선택한 그룹 기준 {selectedCampaignAudience.length}
                            명, 이 중 발송 가능{' '}
                            {selectedCampaignAudienceEligibleCount}명, 확인 필요{' '}
                            {selectedCampaignAudienceAttentionCount}명입니다.
                          </p>
                        </div>
                      </div>
                      <button className="btn btn-primary" type="submit">
                        캠페인 큐에 등록
                      </button>
                    </form>
                  </div>
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
                        placeholder="수신자 이메일 또는 그룹명 검색"
                        value={sendRecipientQuery}
                        onChange={(event) =>
                          setSendRecipientQuery(event.target.value)
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>포함 경로 필터</label>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          className={
                            sendProvenanceFilter === 'all'
                              ? 'btn btn-primary btn-sm'
                              : 'btn btn-secondary btn-sm'
                          }
                          data-testid="send-provenance-filter-all"
                          onClick={() => setSendProvenanceFilter('all')}
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
                          onClick={() => setSendProvenanceFilter('manual')}
                          type="button"
                        >
                          직접 입력
                        </button>
                        <button
                          className={
                            sendProvenanceFilter === 'group'
                              ? 'btn btn-primary btn-sm'
                              : 'btn btn-secondary btn-sm'
                          }
                          data-testid="send-provenance-filter-group"
                          onClick={() => setSendProvenanceFilter('group')}
                          type="button"
                        >
                          저장 그룹
                        </button>
                      </div>
                    </div>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
                    총 {sends.length}건 중 {filteredSends.length}건을
                    표시합니다.
                  </p>
                </div>
                <div className="data-table-wrapper">
                  <table className="data-table" data-testid="send-list">
                    <thead>
                      <tr>
                        <th>종류</th>
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
                            <td>
                              <span
                                className={`badge ${s.kind === 'campaign' ? 'badge-info' : 'badge-neutral'}`}
                              >
                                {s.kind === 'campaign' ? '캠페인' : '개별'}
                              </span>
                            </td>
                            <td style={{ fontWeight: 500 }}>
                              <div>{s.recipientEmail}</div>
                              {s.kind === 'campaign' && s.audienceProvenance ? (
                                <div
                                  className="flex gap-2 flex-wrap"
                                  style={{ marginTop: '0.5rem' }}
                                >
                                  {s.audienceProvenance.manual ? (
                                    <span className="badge badge-neutral">
                                      직접 입력
                                    </span>
                                  ) : null}
                                  {s.audienceProvenance.groups.map((group) => (
                                    <span
                                      key={group.id}
                                      className="badge badge-info"
                                    >
                                      {group.name}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
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
                              <td colSpan={5} style={{ padding: 0 }}>
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
                                      {s.kind === 'campaign' ? (
                                        <div style={{ marginBottom: '1rem' }}>
                                          <h4
                                            style={{
                                              fontSize: 'var(--font-sm)',
                                              marginBottom: '0.5rem',
                                            }}
                                          >
                                            포함 경로
                                          </h4>
                                          {!sendAudienceProvenance ? (
                                            <p
                                              style={{
                                                fontSize: 'var(--font-sm)',
                                                color: 'var(--text-secondary)',
                                              }}
                                            >
                                              이 발송에는 저장된 포함 정보가
                                              없습니다.
                                            </p>
                                          ) : (
                                            <div className="flex gap-2 flex-wrap">
                                              {sendAudienceProvenance.manual ? (
                                                <span className="badge badge-neutral">
                                                  직접 입력으로 포함
                                                </span>
                                              ) : null}
                                              {sendAudienceProvenance.groups.map(
                                                (group) => (
                                                  <span
                                                    key={group.id}
                                                    className="badge badge-info"
                                                  >
                                                    저장 그룹: {group.name}
                                                  </span>
                                                ),
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      ) : null}
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

          {pathname === '/templates' && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">템플릿 관리</h3>
              </div>
              <div className="card-body">
                {/* Keep existing form layout mostly */}
                <div className="grid grid-cols-2">
                  <div>
                    <h4>
                      {editingTemplateId ? '템플릿 수정' : '새 템플릿 생성'}
                    </h4>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveTemplate();
                      }}
                    >
                      <div className="form-group">
                        <label>식별자 이름</label>
                        <input
                          aria-label="식별자 이름"
                          value={templateName}
                          onChange={(e) => setTemplateName(e.target.value)}
                          disabled={!!editingTemplateId}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>제목</label>
                        <input
                          aria-label="제목"
                          value={templateSubject}
                          onChange={(e) => setTemplateSubject(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>HTML 본문</label>
                        <textarea
                          aria-label="HTML 본문"
                          rows={8}
                          value={templateHtml}
                          onChange={(e) => setTemplateHtml(e.target.value)}
                          style={{ fontFamily: 'monospace' }}
                          required
                        />
                      </div>
                      <div className="flex gap-2">
                        <button className="btn btn-primary" type="submit">
                          {editingTemplateId ? '수정하기' : '생성하기'}
                        </button>
                        {editingTemplateId && (
                          <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={() => {
                              setEditingTemplateId(null);
                              setTemplateName('');
                              setTemplateSubject('');
                              setTemplateHtml('');
                              setTemplateFormSuccess(null);
                            }}
                          >
                            취소
                          </button>
                        )}
                      </div>
                    </form>
                    {templateFormError && (
                      <p
                        className="mt-4"
                        style={{ color: 'var(--color-error)' }}
                      >
                        {templateFormError}
                      </p>
                    )}

                    <hr className="mt-6 mb-6" />
                    <h4>미리보기</h4>
                    <div className="form-group">
                      <label>미리보기 데이터 (JSON)</label>
                      <textarea
                        aria-label="미리보기 데이터 (JSON)"
                        rows={4}
                        value={previewDataStr}
                        onChange={(e) => setPreviewDataStr(e.target.value)}
                        style={{ fontFamily: 'monospace' }}
                      />
                    </div>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => void renderPreview()}
                      disabled={isPreviewing}
                    >
                      미리보기 렌더링
                    </button>
                    {previewError && (
                      <p style={{ color: 'var(--color-error)' }}>
                        {previewError}
                      </p>
                    )}
                    {previewSubject && previewHtml && (
                      <div
                        className="mt-4 p-4"
                        style={{
                          border: '1px solid var(--border-light)',
                          borderRadius: 'var(--radius-md)',
                        }}
                      >
                        <div
                          data-testid="preview-subject"
                          style={{
                            fontWeight: 'bold',
                            marginBottom: '0.5rem',
                            borderBottom: '1px solid var(--border-light)',
                            paddingBottom: '0.5rem',
                          }}
                        >
                          Subject: {previewSubject}
                        </div>
                        <div
                          data-testid="preview-html"
                          dangerouslySetInnerHTML={{ __html: previewHtml }}
                        />
                      </div>
                    )}
                    {templateFormSuccess && (
                      <p
                        className="mt-4"
                        style={{ color: 'var(--color-success)' }}
                        data-testid="template-form-success"
                      >
                        {templateFormSuccess}
                      </p>
                    )}
                  </div>
                  <div>
                    <h4>템플릿 목록</h4>
                    {isLoadingTemplates ? (
                      <p>로딩 중...</p>
                    ) : (
                      <ul style={{ padding: 0, listStyle: 'none' }}>
                        {templates.map((t) => (
                          <li
                            key={t.id}
                            data-testid={`template-${t.name}`}
                            className="card"
                            style={{ marginBottom: '1rem', padding: '1rem' }}
                          >
                            <div className="flex justify-between items-center">
                              <strong>{t.name}</strong>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  setEditingTemplateId(t.id);
                                  setTemplateName(t.name);
                                  setTemplateSubject(t.subject);
                                  setTemplateHtml(t.html);
                                }}
                              >
                                수정
                              </button>
                            </div>
                            <div
                              style={{
                                fontSize: 'var(--font-sm)',
                                color: 'var(--text-secondary)',
                                marginTop: '0.5rem',
                              }}
                            >
                              변수:{' '}
                              {t.variables?.length
                                ? t.variables.join(', ')
                                : '없음'}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
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
                  onClick={() => setRoutingSection('nodes')}
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
                  onClick={() => setRoutingSection('rules')}
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
                  onClick={() => setRoutingSection('preview')}
                  type="button"
                >
                  라우트 미리보기
                </button>
              </div>
              <div className="card">
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
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="card">
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
                        className="flex gap-2 items-center"
                        style={{
                          padding: '0.5rem',
                          background: 'var(--bg-surface-hover)',
                          borderRadius: 'var(--radius-md)',
                        }}
                      >
                        <select
                          value={rule.matchType}
                          onChange={(e) =>
                            updateRule(idx, {
                              matchType: e.target.value as 'exact' | 'default',
                              domain:
                                e.target.value === 'default'
                                  ? null
                                  : rule.domain,
                            })
                          }
                        >
                          <option value="exact">정확한 도메인</option>
                          <option value="default">기본 (Fallback)</option>
                        </select>
                        {rule.matchType === 'exact' && (
                          <input
                            data-testid={`routing-domain-${idx}`}
                            placeholder="도메인 (예: gmail.com)"
                            value={rule.domain ?? ''}
                            onChange={(e) =>
                              updateRule(idx, { domain: e.target.value })
                            }
                          />
                        )}
                        <select
                          data-testid={`routing-node-${idx}`}
                          value={rule.sendSmtpNodeId}
                          onChange={(e) =>
                            updateRule(idx, { sendSmtpNodeId: e.target.value })
                          }
                        >
                          <option value="">노드 선택...</option>
                          {smtpNodes.map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.name}
                            </option>
                          ))}
                        </select>
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

              <div className="card">
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
                      <strong>매칭된 노드:</strong>{' '}
                      {previewRouteResult.node.name} <br />
                      <small>
                        (규칙: {previewRouteResult.rule.matchType}, 우선순위:{' '}
                        {previewRouteResult.node.priority})
                      </small>
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
                    onClick={() => setReportingSection('status')}
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
                    onClick={() => setReportingSection('codes')}
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
                    onClick={() => setReportingSection('nodes')}
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
                      {[
                        'subscriber-sync',
                        'individual-send',
                        'campaign-send',
                      ].map((scope) => (
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
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
