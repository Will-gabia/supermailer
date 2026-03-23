export type SubscriberTab = 'all' | 'eligible' | 'unsubscribed' | 'suppressed';

export type SubscriberFilterQueryState = {
  tab: SubscriberTab;
};

export const defaultSubscriberFilterQueryState: SubscriberFilterQueryState = {
  tab: 'all',
};

const isValidSubscriberTab = (value: string | null): value is SubscriberTab =>
  value === 'all' ||
  value === 'eligible' ||
  value === 'unsubscribed' ||
  value === 'suppressed';

export const parseSubscriberFiltersFromSearch = (
  search: string,
): SubscriberFilterQueryState => {
  const params = new URLSearchParams(search);
  const tab = params.get('tab');

  return {
    tab: isValidSubscriberTab(tab) ? tab : 'all',
  };
};

export const buildSubscriberFiltersSearch = (
  state: SubscriberFilterQueryState,
): string => {
  if (state.tab === 'all') {
    return '';
  }

  const params = new URLSearchParams();
  params.set('tab', state.tab);
  return `?${params.toString()}`;
};
