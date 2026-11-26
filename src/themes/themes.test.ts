import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { THEMES } from '.';

const classes = (id: string) =>
  [...new Set(readFileSync(new URL(`./${id}.css`, import.meta.url), 'utf8').match(/\.ui-[a-z-]+/g))].sort();

test('every theme styles the same classes', () => {
  const [first, ...rest] = THEMES;
  expect(classes(first.id).length).toBeGreaterThan(0);
  for (const theme of rest) expect(classes(theme.id), theme.id).toEqual(classes(first.id));
});
