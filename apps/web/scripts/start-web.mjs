import { spawn } from 'node:child_process';
import { resolveStandaloneDir } from './resolve-standalone-dir.mjs';

const dir = resolveStandaloneDir();
if (!dir) {
  console.error(
    'web: standalone server not found. Expected .next/standalone/server.js. Run pnpm build first.',
  );
  process.exit(1);
}

const child = spawn(process.execPath, ['server.js'], {
  cwd: dir,
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
