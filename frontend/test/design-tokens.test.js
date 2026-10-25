import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTokensCss } from '../scripts/build-tokens.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tokens = JSON.parse(fs.readFileSync(path.join(root, 'design', 'tokens.json'), 'utf8'));
const css = generateTokensCss(tokens);

test('every color token is emitted for light and dark', () => {
  const lightBlock = css.split('@media')[0];
  const darkBlock = css.slice(css.indexOf('@media'));
  for (const t of tokens.color.tokens) {
    assert.ok(lightBlock.includes(`--${t.name}: ${t.value.light};`), `light ${t.name}`);
    assert.ok(darkBlock.includes(`--${t.name}: ${t.value.dark};`), `dark ${t.name}`);
  }
});

test('dark mode follows the device unless data-theme says otherwise', () => {
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme='light'\]\)/);
  assert.match(css, /:root\[data-theme='dark'\]/);
});

test('spacing, radii, fonts and type styles are emitted', () => {
  assert.match(css, /--target-min: 44px;/);
  assert.match(css, /--sidebar-width: 248px;/);
  assert.match(css, /--radius-card: 12px;/);
  assert.match(css, /--font-sans: "IBM Plex Sans"/);
  assert.match(css, /\.rd-t-page-title \{[^}]*font-size: 28px/);
  assert.match(css, /\.rd-t-overline \{[^}]*text-transform: uppercase/);
});
