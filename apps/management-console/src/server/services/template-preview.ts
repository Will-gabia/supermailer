export const extractVariables = (text: string): string[] => {
  const matches = text.match(/\{\{([^}]+)\}\}/g);
  if (!matches) {
    return [];
  }
  return Array.from(new Set(matches.map((m) => m.slice(2, -2).trim())));
};

export const renderTemplate = (text: string, data: Record<string, string>): string => {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const trimmedKey = key.trim();
    return typeof data[trimmedKey] === 'string' ? data[trimmedKey] : '';
  });
};
