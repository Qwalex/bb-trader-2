import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Каталог, из которого Next ожидает запуск `node server.js` (есть node_modules/.next). */
export function resolveStandaloneDir() {
  const candidates = [
    path.join(root, '.next', 'standalone'),
    path.join(root, '.next', 'standalone', 'apps', 'web'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'server.js'))) return dir;
  }
  return null;
}
