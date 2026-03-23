import { normalizeEmailAddress } from '@supermailer/contracts';
import { eq } from 'drizzle-orm';

import type { ManagementConsoleAppContext } from '../app-context';
import {
  subscriberGroupMemberships,
  subscribers,
  suppressions,
  syncRunRecords,
} from '../db/schema';

export const deleteSubscriberSafely = async (
  appContext: ManagementConsoleAppContext,
  subscriberId: string,
) =>
  appContext.db.transaction(async (transaction) => {
    const [existingSubscriber] = await transaction
      .select()
      .from(subscribers)
      .where(eq(subscribers.id, subscriberId))
      .limit(1);

    if (!existingSubscriber) {
      return null;
    }

    await transaction
      .update(syncRunRecords)
      .set({ subscriberId: null })
      .where(eq(syncRunRecords.subscriberId, subscriberId));

    await transaction
      .delete(subscriberGroupMemberships)
      .where(eq(subscriberGroupMemberships.subscriberId, subscriberId));

    await transaction
      .delete(suppressions)
      .where(
        eq(suppressions.email, normalizeEmailAddress(existingSubscriber.email)),
      );

    const [deletedSubscriber] = await transaction
      .delete(subscribers)
      .where(eq(subscribers.id, subscriberId))
      .returning();

    return deletedSubscriber ?? null;
  });
