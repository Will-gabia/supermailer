export type SendProvenanceFilter = 'all' | 'manual' | 'group';

export type SendFilterQueryState = {
  recipientQuery: string;
  provenanceFilter: SendProvenanceFilter;
  page: number;
};

export const defaultSendFilterQueryState: SendFilterQueryState = {
  recipientQuery: '',
  provenanceFilter: 'all',
  page: 1,
};

const parsePage = (value: string | null): number => {
  if (!value) {
    return 1;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
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
  const page = parsePage(params.get('page'));

  return {
    recipientQuery,
    provenanceFilter: isValidProvenanceFilter(provenanceValue)
      ? provenanceValue
      : 'all',
    page,
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

  if (state.page > 1) {
    params.set('page', String(state.page));
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
};
