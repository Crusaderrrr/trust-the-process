import { api } from '../api/client';

/** Colours the user picked per template id (defaults live in domain/templates). */
export const getTemplateColors = () => api<Record<string, string>>('GET', '/settings/template-colors');

export const setTemplateColor = (templateId: string, color: string) =>
  api('PUT', `/settings/template-colors/${templateId}`, { color });
