import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
// GitHub Pages serves 404.html for unknown paths, so this makes deep links survive a refresh
fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'));
console.log('dist/404.html written (single-page-app fallback).');
