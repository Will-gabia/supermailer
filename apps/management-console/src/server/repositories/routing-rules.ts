import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';

import type { ManagementConsoleDatabase } from '../db';
import { routingRules, sendSmtpNodes } from '../db/schema';

export type RoutingRuleInput = {
  id: string;
  matchType: 'exact' | 'default';
  domain?: string | null;
  sendSmtpNodeId: string;
  priority?: number;
  isActive?: boolean;
};

const normalizeDomain = (domain: string): string => domain.trim().toLowerCase();

const extractRecipientDomain = (email: string): string => {
  const [, domain = ''] = email.trim().toLowerCase().split('@');
  return domain;
};

export const createRoutingRulesRepository = (db: ManagementConsoleDatabase) => ({
  createRuleset: async (rules: RoutingRuleInput[]): Promise<number> => {
    const activeDefaultRules = rules.filter((rule) => rule.matchType === 'default' && (rule.isActive ?? true));

    if (activeDefaultRules.length !== 1) {
      throw new Error('routing rules require exactly one active default rule');
    }

    const exactDomains = rules.filter((rule) => rule.matchType === 'exact').map((rule) => normalizeDomain(rule.domain ?? ''));
    if (new Set(exactDomains).size !== exactDomains.length) {
      throw new Error('routing rules require unique exact-match domains per version');
    }

    return db.transaction(async (transaction) => {
      const [versionRow] = await transaction.select({ value: sql<number>`coalesce(max(${routingRules.version}), 0)` }).from(routingRules);
      const version = Number(versionRow?.value ?? 0) + 1;

      for (const rule of rules) {
        const [node] = await transaction
          .select()
          .from(sendSmtpNodes)
          .where(and(eq(sendSmtpNodes.id, rule.sendSmtpNodeId), eq(sendSmtpNodes.isActive, true)))
          .limit(1);

        if (!node) {
          throw new Error(`routing rule requires active SendSMTP node: ${rule.sendSmtpNodeId}`);
        }
      }

      await transaction.insert(routingRules).values(
        rules.map((rule) => ({
          id: rule.id,
          version,
          matchType: rule.matchType,
          domain: rule.matchType === 'exact' ? normalizeDomain(rule.domain ?? '') : null,
          sendSmtpNodeId: rule.sendSmtpNodeId,
          priority: rule.priority ?? 100,
          isActive: rule.isActive ?? true,
        })),
      );

      return version;
    });
  },
  getLatestVersion: async (): Promise<number | null> => {
    const [row] = await db.select({ value: sql<number>`max(${routingRules.version})` }).from(routingRules);

    return row?.value ?? null;
  },
  listRulesByVersion: async (version: number) =>
    db.select().from(routingRules).where(eq(routingRules.version, version)).orderBy(asc(routingRules.priority), asc(routingRules.id)),
  findRouteForRecipient: async (recipientEmail: string) => {
    const version = await db
      .select({ value: sql<number>`max(${routingRules.version})` })
      .from(routingRules)
      .then(([row]) => row?.value ?? null);

    if (version === null) {
      return null;
    }

    const domain = extractRecipientDomain(recipientEmail);

    const [exactMatch] = await db
      .select({
        rule: routingRules,
        node: sendSmtpNodes,
      })
      .from(routingRules)
      .innerJoin(sendSmtpNodes, eq(routingRules.sendSmtpNodeId, sendSmtpNodes.id))
      .where(
        and(
          eq(routingRules.version, version),
          eq(routingRules.matchType, 'exact'),
          eq(routingRules.domain, domain),
          eq(routingRules.isActive, true),
          eq(sendSmtpNodes.isActive, true),
        ),
      )
      .orderBy(asc(routingRules.priority), desc(sendSmtpNodes.priority), asc(routingRules.id))
      .limit(1);

    if (exactMatch) {
      return exactMatch;
    }

    const [defaultMatch] = await db
      .select({
        rule: routingRules,
        node: sendSmtpNodes,
      })
      .from(routingRules)
      .innerJoin(sendSmtpNodes, eq(routingRules.sendSmtpNodeId, sendSmtpNodes.id))
      .where(
        and(
          eq(routingRules.version, version),
          eq(routingRules.matchType, 'default'),
          isNull(routingRules.domain),
          eq(routingRules.isActive, true),
          eq(sendSmtpNodes.isActive, true),
        ),
      )
      .orderBy(asc(routingRules.priority), desc(sendSmtpNodes.priority), asc(routingRules.id))
      .limit(1);

    return defaultMatch ?? null;
  },
});
