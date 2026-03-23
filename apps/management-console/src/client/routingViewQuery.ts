export type RoutingSection = 'nodes' | 'rules' | 'preview';

export type RoutingViewQueryState = {
  section: RoutingSection;
};

export const defaultRoutingViewQueryState: RoutingViewQueryState = {
  section: 'nodes',
};

const isValidRoutingSection = (value: string | null): value is RoutingSection =>
  value === 'nodes' || value === 'rules' || value === 'preview';

export const parseRoutingViewFromSearch = (
  search: string,
): RoutingViewQueryState => {
  const params = new URLSearchParams(search);
  const section = params.get('section');

  return {
    section: isValidRoutingSection(section) ? section : 'nodes',
  };
};

export const buildRoutingViewSearch = (
  state: RoutingViewQueryState,
): string => {
  if (state.section === 'nodes') {
    return '';
  }

  const params = new URLSearchParams();
  params.set('section', state.section);
  return `?${params.toString()}`;
};
