type AudienceProvenance = {
  manual: boolean;
  groups: Array<{ id: string; name: string }>;
};

type SendLike = {
  kind: string;
  recipientEmail: string;
  audienceProvenance?: AudienceProvenance | null;
};

export type SendsFilterInput<TSend extends SendLike> = {
  sends: TSend[];
  recipientQuery: string;
  provenanceFilter: 'all' | 'manual' | 'group';
};

const matchesProvenanceFilter = (
  send: SendLike,
  provenanceFilter: 'all' | 'manual' | 'group',
): boolean => {
  if (provenanceFilter === 'all') {
    return true;
  }

  if (send.kind !== 'campaign' || !send.audienceProvenance) {
    return false;
  }

  if (provenanceFilter === 'manual') {
    return send.audienceProvenance.manual;
  }

  return send.audienceProvenance.groups.length > 0;
};

const matchesQuery = (send: SendLike, query: string): boolean => {
  if (!query) {
    return true;
  }

  const queryTarget = [
    send.recipientEmail,
    send.audienceProvenance?.manual ? '직접 입력' : '',
    ...(send.audienceProvenance?.groups.map((group) => group.name) ?? []),
  ]
    .join(' ')
    .toLowerCase();

  return queryTarget.includes(query);
};

export const filterSends = <TSend extends SendLike>({
  sends,
  recipientQuery,
  provenanceFilter,
}: SendsFilterInput<TSend>): TSend[] => {
  const normalizedQuery = recipientQuery.trim().toLowerCase();

  return sends.filter(
    (send) =>
      matchesProvenanceFilter(send, provenanceFilter) &&
      matchesQuery(send, normalizedQuery),
  );
};
