import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptDir, '..');
const srcGen = path.join(root, 'src', 'generated');
const destGen = path.join(root, 'dist', 'generated');

if (!fs.existsSync(srcGen)) {
  console.error('shared-prisma: src/generated missing after prisma generate');
  process.exit(1);
}

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
// Не делаем rmSync: на Windows query_engine-*.dll может быть залочен живым node.
try {
  fs.cpSync(srcGen, destGen, { recursive: true, force: true });
} catch (err) {
  const staleOk =
    (err && (err.code === 'EPIPE' || err.code === 'EPERM')) &&
    fs.existsSync(path.join(destGen, 'client', 'index.js'));
  if (staleOk) {
    console.warn('shared-prisma: copy-generated skipped (destination locked):', err.message);
    process.exit(0);
  }
  throw err;
}
