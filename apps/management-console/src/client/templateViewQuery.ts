export type TemplateViewQueryState = {
  templateId: string | null;
};

export const defaultTemplateViewQueryState: TemplateViewQueryState = {
  templateId: null,
};

export const parseTemplateViewFromSearch = (
  search: string,
): TemplateViewQueryState => {
  const params = new URLSearchParams(search);
  const templateId = params.get('template')?.trim() ?? '';

  return {
    templateId: templateId.length > 0 ? templateId : null,
  };
};

export const buildTemplateViewSearch = (
  state: TemplateViewQueryState,
): string => {
  if (!state.templateId) {
    return '';
  }

  const params = new URLSearchParams();
  params.set('template', state.templateId);
  return `?${params.toString()}`;
};
