import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : [p];
  });
}

test('no hex, rgb or hsl colors in source files (the generated tokens file is exempt)', () => {
  const offenders = [];
  for (const file of files(src)) {
    if (!/\.(css|jsx?|html)$/.test(file) || file.endsWith('tokens.css')) continue;
    const text = fs.readFileSync(file, 'utf8');
    const hits = text.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g);
    if (hits) offenders.push(`${path.relative(src, file)}: ${[...new Set(hits)].join(', ')}`);
  }
  assert.deepEqual(offenders, []);
});
