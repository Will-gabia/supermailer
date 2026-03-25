const allowedScopes = new Set(['individual-send']);

export type ApiKeyScope = 'individual-send';

export type ApiKeyViewQueryState = {
  scopes: ApiKeyScope[];
};

export const defaultApiKeyViewQueryState: ApiKeyViewQueryState = {
  scopes: ['individual-send'],
};

export const parseApiKeyViewFromSearch = (
  search: string,
): ApiKeyViewQueryState => {
  const params = new URLSearchParams(search);
  const scopes = Array.from(
    new Set(
      params
        .getAll('scope')
        .filter((scope): scope is ApiKeyScope => allowedScopes.has(scope)),
    ),
  );

  return {
    scopes: scopes.length > 0 ? scopes : ['individual-send'],
  };
};

export const buildApiKeyViewSearch = (state: ApiKeyViewQueryState): string => {
  const normalizedScopes = Array.from(new Set(state.scopes)).sort();
  const defaultScopes = [...defaultApiKeyViewQueryState.scopes].sort();

  if (JSON.stringify(normalizedScopes) === JSON.stringify(defaultScopes)) {
    return '';
  }

  const params = new URLSearchParams();
  normalizedScopes.forEach((scope) => params.append('scope', scope));
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
};
