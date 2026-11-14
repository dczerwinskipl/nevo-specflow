#!/usr/bin/env node
// Starts or stops the optional embedding model for semantic documentation search
// (`compose.yaml` beside this script; `--gpu` adds `compose.gpu.yaml`). Usage:
//   pnpm docs:embeddings:up [--gpu]
//   pnpm docs:embeddings:down
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const USAGE = 'Usage: pnpm docs:embeddings:up [--gpu] | pnpm docs:embeddings:down';
const [command, ...flags] = process.argv.slice(2);
const gpu = flags.includes('--gpu');

if (
  (command !== 'up' && command !== 'down') ||
  flags.some((flag) => flag !== '--gpu') ||
  (command === 'down' && gpu)
) {
  console.error(USAGE);
  process.exit(2);
}

const files = ['compose.yaml', ...(gpu ? ['compose.gpu.yaml'] : [])].flatMap((file) => [
  '-f',
  path.join(import.meta.dirname, file),
]);
// `up` recreates the container when switching between CPU and GPU; the model volume stays.
const args = ['compose', ...files, ...(command === 'up' ? ['up', '-d'] : ['down'])];

const result = spawnSync('docker', args, { stdio: 'inherit' });
if (result.error !== undefined) {
  console.error(`Could not run docker (${result.error.message}); is Docker installed?`);
  process.exit(1);
}

process.exit(result.status ?? 1);
