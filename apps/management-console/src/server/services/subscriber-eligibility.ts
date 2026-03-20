import { normalizeEmailAddress } from '@supermailer/contracts';

import type { ManagementConsoleAppContext } from '../app-context';

export type SubscriberEligibility = {
  eligible: boolean;
  reason: 'unsubscribed' | 'hard_bounce_suppression' | null;
  suppressionReasons: string[];
};

export const getSubscriberEligibility = async (
  appContext: ManagementConsoleAppContext,
  email: string,
): Promise<SubscriberEligibility> => {
  const normalizedEmail = normalizeEmailAddress(email);
  const subscriber = await appContext.repositories.subscribers.findByEmail(normalizedEmail);
  const suppressionRecords = await appContext.repositories.suppressions.listByEmail(normalizedEmail);
  const suppressionReasons = Array.from(new Set(suppressionRecords.map((record) => record.reason)));

  if (suppressionReasons.includes('hard_bounce')) {
    return {
      eligible: false,
      reason: 'hard_bounce_suppression',
      suppressionReasons,
    };
  }

  if (subscriber?.unsubscribedAt) {
    return {
      eligible: false,
      reason: 'unsubscribed',
      suppressionReasons,
    };
  }

  return {
    eligible: true,
    reason: null,
    suppressionReasons,
  };
};
