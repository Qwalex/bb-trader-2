import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { encryptSecret } from '../packages/shared-ts/dist/crypto.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function main() {
  const key = randomBytes(32).toString('hex');
  const plain = `contract-${Date.now()}`;
  const cipher = encryptSecret({ encryptionKey: key }, plain);
  const pythonScript = join(__dirname, '..', 'apps', 'userbot', 'scripts', 'crypto_contract_check.py');
  const out = spawnSync('python', [pythonScript, key, cipher], { encoding: 'utf8' });
  if (out.status !== 0) {
    throw new Error(out.stderr || out.stdout || 'python contract check failed');
  }
  const parsed = JSON.parse(out.stdout.trim());
  if (parsed.plain !== plain) {
    throw new Error(`crypto contract mismatch: expected=${plain}, got=${parsed.plain}`);
  }
  // eslint-disable-next-line no-console
  console.log('crypto contract check: OK');
}

main();
