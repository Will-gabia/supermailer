export type SendProvenanceFilter = 'all' | 'manual' | 'group';

export type SendFilterQueryState = {
  recipientQuery: string;
  provenanceFilter: SendProvenanceFilter;
};

export const defaultSendFilterQueryState: SendFilterQueryState = {
  recipientQuery: '',
  provenanceFilter: 'all',
};

const isValidProvenanceFilter = (
  value: string | null,
): value is SendProvenanceFilter =>
  value === 'all' || value === 'manual' || value === 'group';

export const parseSendFiltersFromSearch = (
  search: string,
): SendFilterQueryState => {
  const params = new URLSearchParams(search);
  const recipientQuery = (params.get('search') ?? '').trim();
  const provenanceValue = params.get('provenance');

  return {
    recipientQuery,
    provenanceFilter: isValidProvenanceFilter(provenanceValue)
      ? provenanceValue
      : 'all',
  };
};

export const buildSendFiltersSearch = (state: SendFilterQueryState): string => {
  const params = new URLSearchParams();
  const recipientQuery = state.recipientQuery.trim();

  if (recipientQuery) {
    params.set('search', recipientQuery);
  }

  if (state.provenanceFilter !== 'all') {
    params.set('provenance', state.provenanceFilter);
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
};
