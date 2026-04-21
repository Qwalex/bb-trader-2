/**
 * После `next build` с `output: 'standalone'` Next ожидает, что `static` и `public`
 * лежат рядом со standalone-сервером (см. доку Next «Standalone output»).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveStandaloneDir } from './resolve-standalone-dir.mjs';

const appRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const standDir = resolveStandaloneDir();
if (!standDir) {
  console.warn('web: standalone layout not found (skip prepare-standalone)');
  process.exit(0);
}

const nextStatic = path.join(appRoot, '.next', 'static');
const destStatic = path.join(standDir, '.next', 'static');
if (fs.existsSync(nextStatic)) {
  fs.mkdirSync(path.dirname(destStatic), { recursive: true });
  fs.cpSync(nextStatic, destStatic, { recursive: true, force: true });
}

const pub = path.join(appRoot, 'public');
const destPub = path.join(standDir, 'public');
if (fs.existsSync(pub)) {
  fs.cpSync(pub, destPub, { recursive: true, force: true });
}
