/**
 * Themes are plain CSS: components use `.ui-*` classes and each theme file styles them under
 * `[data-theme='<id>']`. New theme: add `<id>.css`, import it in index.css, list it here.
 * The choice is per device (localStorage).
 */
export const THEMES = [
  { id: 'glass', name: 'Glass' },
  { id: 'original', name: 'Original' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

const KEY = 'theme';

export function getTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(KEY);
    return THEMES.find((t) => t.id === saved)?.id ?? THEMES[0].id;
  } catch {
    return THEMES[0].id; // storage blocked
  }
}

export function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // still applied for this visit
  }
}
