import { eq, inArray } from 'drizzle-orm';

import type { ManagementConsoleDatabase } from '../db';
import {
  subscriberGroupMemberships,
  subscriberGroups,
  subscribers,
} from '../db/schema';

export const createSubscriberGroupMembershipsRepository = (
  db: ManagementConsoleDatabase,
) => ({
  listForSubscriberIds: async (subscriberIds: string[]) => {
    const uniqueSubscriberIds = Array.from(new Set(subscriberIds));

    if (uniqueSubscriberIds.length === 0) {
      return [];
    }

    return db
      .select({
        subscriberId: subscriberGroupMemberships.subscriberId,
        groupId: subscriberGroups.id,
        groupName: subscriberGroups.name,
      })
      .from(subscriberGroupMemberships)
      .innerJoin(
        subscriberGroups,
        eq(subscriberGroupMemberships.groupId, subscriberGroups.id),
      )
      .where(
        inArray(subscriberGroupMemberships.subscriberId, uniqueSubscriberIds),
      );
  },
  listEmailsForGroupIds: async (groupIds: string[]) => {
    const uniqueGroupIds = Array.from(new Set(groupIds));

    if (uniqueGroupIds.length === 0) {
      return [];
    }

    return db
      .select({
        groupId: subscriberGroupMemberships.groupId,
        groupName: subscriberGroups.name,
        subscriberId: subscribers.id,
        email: subscribers.email,
        displayName: subscribers.displayName,
      })
      .from(subscriberGroupMemberships)
      .innerJoin(
        subscriberGroups,
        eq(subscriberGroupMemberships.groupId, subscriberGroups.id),
      )
      .innerJoin(
        subscribers,
        eq(subscriberGroupMemberships.subscriberId, subscribers.id),
      )
      .where(inArray(subscriberGroupMemberships.groupId, uniqueGroupIds));
  },
  replaceForSubscriber: async (input: {
    subscriberId: string;
    groupIds: string[];
  }) => {
    const uniqueGroupIds = Array.from(new Set(input.groupIds));

    await db
      .delete(subscriberGroupMemberships)
      .where(eq(subscriberGroupMemberships.subscriberId, input.subscriberId));

    if (uniqueGroupIds.length === 0) {
      return;
    }

    await db.insert(subscriberGroupMemberships).values(
      uniqueGroupIds.map((groupId) => ({
        subscriberId: input.subscriberId,
        groupId,
      })),
    );
  },
  deleteForSubscriber: async (subscriberId: string) => {
    await db
      .delete(subscriberGroupMemberships)
      .where(eq(subscriberGroupMemberships.subscriberId, subscriberId));
  },
});
