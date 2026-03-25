import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import type { ManagementConsoleDatabase } from '../db';
import {
  routingRuleFailoverNodes,
  routingRules,
  sendSmtpNodes,
} from '../db/schema';

export type RoutingRuleInput = {
  id: string;
  matchType: 'exact' | 'default';
  domain?: string | null;
  sendSmtpNodeId: string;
  failoverNodeIds?: string[];
  priority?: number;
  isActive?: boolean;
};

type RoutingRuleRecord = typeof routingRules.$inferSelect;
type SendSmtpNodeRecord = typeof sendSmtpNodes.$inferSelect;

type RoutingRuleWithFailover = RoutingRuleRecord & {
  failoverNodeIds: string[];
};

type ResolvedRoutingRoute = {
  rule: RoutingRuleWithFailover;
  node: SendSmtpNodeRecord;
  nodes: SendSmtpNodeRecord[];
};

const normalizeDomain = (domain: string): string => domain.trim().toLowerCase();

const extractRecipientDomain = (email: string): string => {
  const [, domain = ''] = email.trim().toLowerCase().split('@');
  return domain;
};

export const createRoutingRulesRepository = (
  db: ManagementConsoleDatabase,
) => ({
  createRuleset: async (rules: RoutingRuleInput[]): Promise<number> => {
    const activeDefaultRules = rules.filter(
      (rule) => rule.matchType === 'default' && (rule.isActive ?? true),
    );

    if (activeDefaultRules.length !== 1) {
      throw new Error('routing rules require exactly one active default rule');
    }

    const exactDomains = rules
      .filter((rule) => rule.matchType === 'exact')
      .map((rule) => normalizeDomain(rule.domain ?? ''));
    if (new Set(exactDomains).size !== exactDomains.length) {
      throw new Error(
        'routing rules require unique exact-match domains per version',
      );
    }

    return db.transaction(async (transaction) => {
      const [versionRow] = await transaction
        .select({
          value: sql<number>`coalesce(max(${routingRules.version}), 0)`,
        })
        .from(routingRules);
      const version = Number(versionRow?.value ?? 0) + 1;

      for (const rule of rules) {
        const nodeIds = Array.from(
          new Set([rule.sendSmtpNodeId, ...(rule.failoverNodeIds ?? [])]),
        );
        const nodes = await transaction
          .select()
          .from(sendSmtpNodes)
          .where(
            and(
              inArray(sendSmtpNodes.id, nodeIds),
              eq(sendSmtpNodes.isActive, true),
              isNull(sendSmtpNodes.deletedAt),
            ),
          );

        if (nodes.length !== nodeIds.length) {
          throw new Error(
            `routing rule requires active SendSMTP nodes: ${nodeIds.join(', ')}`,
          );
        }
      }

      const insertedRules = await transaction
        .insert(routingRules)
        .values(
          rules.map((rule) => ({
            id: rule.id,
            version,
            matchType: rule.matchType,
            domain:
              rule.matchType === 'exact'
                ? normalizeDomain(rule.domain ?? '')
                : null,
            sendSmtpNodeId: rule.sendSmtpNodeId,
            priority: rule.priority ?? 100,
            isActive: rule.isActive ?? true,
          })),
        )
        .returning();

      const failoverRows = insertedRules.flatMap((rule, index) => {
        const orderedNodeIds = [
          rules[index].sendSmtpNodeId,
          ...(rules[index].failoverNodeIds ?? []).filter(
            (nodeId) => nodeId !== rules[index].sendSmtpNodeId,
          ),
        ];

        return orderedNodeIds.map((nodeId, position) => ({
          id: `${rule.id}:${position + 1}`,
          routingRuleId: rule.id,
          sendSmtpNodeId: nodeId,
          position: position + 1,
        }));
      });

      if (failoverRows.length > 0) {
        await transaction.insert(routingRuleFailoverNodes).values(failoverRows);
      }

      return version;
    });
  },
  getLatestVersion: async (): Promise<number | null> => {
    const [row] = await db
      .select({ value: sql<number>`max(${routingRules.version})` })
      .from(routingRules);

    return row?.value ?? null;
  },
  listRulesByVersion: async (version: number) => {
    const rules = await db
      .select()
      .from(routingRules)
      .where(eq(routingRules.version, version))
      .orderBy(asc(routingRules.priority), asc(routingRules.id));

    return hydrateRulesWithFailoverNodes(db, rules);
  },
  isNodeReferencedByLatestVersion: async (nodeId: string) => {
    const version = await db
      .select({ value: sql<number>`max(${routingRules.version})` })
      .from(routingRules)
      .then(([row]) => row?.value ?? null);

    if (version === null) {
      return false;
    }

    const [record] = await db
      .select({ id: routingRuleFailoverNodes.id })
      .from(routingRuleFailoverNodes)
      .innerJoin(
        routingRules,
        eq(routingRuleFailoverNodes.routingRuleId, routingRules.id),
      )
      .where(
        and(
          eq(routingRules.version, version),
          eq(routingRuleFailoverNodes.sendSmtpNodeId, nodeId),
        ),
      )
      .limit(1);

    return Boolean(record);
  },
  findRouteForRecipient: async (
    recipientEmail: string,
  ): Promise<ResolvedRoutingRoute | null> => {
    const version = await db
      .select({ value: sql<number>`max(${routingRules.version})` })
      .from(routingRules)
      .then(([row]) => row?.value ?? null);

    if (version === null) {
      return null;
    }

    const domain = extractRecipientDomain(recipientEmail);

    const [exactMatch] = await db
      .select({ rule: routingRules })
      .from(routingRules)
      .where(
        and(
          eq(routingRules.version, version),
          eq(routingRules.matchType, 'exact'),
          eq(routingRules.domain, domain),
          eq(routingRules.isActive, true),
        ),
      )
      .orderBy(asc(routingRules.priority), asc(routingRules.id))
      .limit(1);

    if (exactMatch) {
      return hydrateResolvedRoute(db, exactMatch.rule);
    }

    const [defaultMatch] = await db
      .select({ rule: routingRules })
      .from(routingRules)
      .where(
        and(
          eq(routingRules.version, version),
          eq(routingRules.matchType, 'default'),
          isNull(routingRules.domain),
          eq(routingRules.isActive, true),
        ),
      )
      .orderBy(asc(routingRules.priority), asc(routingRules.id))
      .limit(1);

    return defaultMatch ? hydrateResolvedRoute(db, defaultMatch.rule) : null;
  },
});

const hydrateRulesWithFailoverNodes = async (
  db: ManagementConsoleDatabase,
  rules: RoutingRuleRecord[],
): Promise<RoutingRuleWithFailover[]> => {
  if (rules.length === 0) {
    return [];
  }

  const failoverRows = await db
    .select()
    .from(routingRuleFailoverNodes)
    .where(
      inArray(
        routingRuleFailoverNodes.routingRuleId,
        rules.map((rule) => rule.id),
      ),
    )
    .orderBy(
      asc(routingRuleFailoverNodes.routingRuleId),
      asc(routingRuleFailoverNodes.position),
    );

  return rules.map((rule) => ({
    ...rule,
    failoverNodeIds: failoverRows
      .filter((row) => row.routingRuleId === rule.id)
      .map((row) => row.sendSmtpNodeId),
  }));
};

const hydrateResolvedRoute = async (
  db: ManagementConsoleDatabase,
  rule: RoutingRuleRecord,
): Promise<ResolvedRoutingRoute | null> => {
  const [hydratedRule] = await hydrateRulesWithFailoverNodes(db, [rule]);

  if (!hydratedRule || hydratedRule.failoverNodeIds.length === 0) {
    return null;
  }

  const nodes = await db
    .select()
    .from(sendSmtpNodes)
    .where(
      and(
        inArray(sendSmtpNodes.id, hydratedRule.failoverNodeIds),
        eq(sendSmtpNodes.isActive, true),
        isNull(sendSmtpNodes.deletedAt),
      ),
    );

  const orderedNodes = hydratedRule.failoverNodeIds
    .map((nodeId) => nodes.find((node) => node.id === nodeId) ?? null)
    .filter((node): node is SendSmtpNodeRecord => Boolean(node));

  if (orderedNodes.length === 0) {
    return null;
  }

  return {
    rule: hydratedRule,
    node: orderedNodes[0],
    nodes: orderedNodes,
  };
};
