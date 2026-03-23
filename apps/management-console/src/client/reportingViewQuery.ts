export type ReportingSection = 'status' | 'codes' | 'nodes';

export type ReportingViewQueryState = {
  section: ReportingSection;
};

export const defaultReportingViewQueryState: ReportingViewQueryState = {
  section: 'status',
};

const isValidReportingSection = (
  value: string | null,
): value is ReportingSection =>
  value === 'status' || value === 'codes' || value === 'nodes';

export const parseReportingViewFromSearch = (
  search: string,
): ReportingViewQueryState => {
  const params = new URLSearchParams(search);
  const section = params.get('section');

  return {
    section: isValidReportingSection(section) ? section : 'status',
  };
};

export const buildReportingViewSearch = (
  state: ReportingViewQueryState,
): string => {
  if (state.section === 'status') {
    return '';
  }

  const params = new URLSearchParams();
  params.set('section', state.section);
  return `?${params.toString()}`;
};
