#!/usr/bin/env node
/**
 * Cross-platform wrapper that runs `uv run <args>` if uv is installed,
 * otherwise prints a friendly skip message and exits 0.
 *
 * Used by non-critical scripts (typecheck/lint/format) so that monorepo-wide
 * commands (`pnpm -r typecheck`, `turbo run typecheck`) don't fail on machines
 * without uv installed. Scripts that *require* uv (e.g. `dev`) call uv directly.
 */
import { spawnSync } from 'node:child_process';

const probe = spawnSync('uv', ['--version'], { stdio: 'ignore', shell: true });
if (probe.status !== 0) {
  const args = process.argv.slice(2).join(' ');
  console.log(
    `[userbot] uv is not installed in PATH — skipping \`uv run ${args}\`. ` +
      `Install uv (https://docs.astral.sh/uv/) to enable Python checks.`,
  );
  process.exit(0);
}

const result = spawnSync('uv', ['run', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
});
process.exit(result.status ?? 1);
