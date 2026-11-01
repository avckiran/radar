// After the build: list every file in dist and write dist/sw.js from sw-template.js.
// The version is a fingerprint of the file list and contents, so a new build means a new cache.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'dist');

export function listFiles(dir, root = dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name), root) : [path.relative(root, path.join(dir, e.name)).split(path.sep).join('/')]))
    .sort();
}

export function precacheList(files) {
  return files.filter((f) => {
    // 404.html is a copy of index.html for GitHub Pages; sw.js must never cache itself
    if (f === 'sw.js' || f === '404.html' || f.endsWith('.map')) return false;
    // Fonts: keep the modern format for the Latin letters only. Other alphabets are saved if they are ever used.
    if (/\.woff$/.test(f)) return false;
    if (/\.woff2$/.test(f) && !/-latin-\d+-normal-/.test(f)) return false;
    return true;
  });
}

export function buildSw({ distDir = dist } = {}) {
  const precache = precacheList(listFiles(distDir));
  const hash = crypto.createHash('sha256');
  for (const f of precache) hash.update(f).update(fs.readFileSync(path.join(distDir, f)));
  const version = hash.digest('hex').slice(0, 12);
  const template = fs.readFileSync(path.join(here, 'sw-template.js'), 'utf8');
  const out = template.split('__VERSION__').join(version).split('__PRECACHE__').join(JSON.stringify(precache, null, 2));
  fs.writeFileSync(path.join(distDir, 'sw.js'), out);
  return { version, count: precache.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { version, count } = buildSw();
  console.log(`dist/sw.js written (version ${version}, ${count} files saved for offline use).`);
}
