#!/usr/bin/env node
// Starts, stops or shows the optional embedding model for semantic documentation search
// (`compose.yaml` beside this script; `--gpu` adds `compose.gpu.yaml`). Usage:
//   pnpm docs:embeddings:up [--gpu]
//   pnpm docs:embeddings:down
//   pnpm docs:embeddings:status
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const USAGE =
  'Usage: pnpm docs:embeddings:up [--gpu] | pnpm docs:embeddings:down | pnpm docs:embeddings:status';
const [command, ...flags] = process.argv.slice(2);
const gpu = flags.includes('--gpu');

if (
  !['up', 'down', 'status'].includes(command ?? '') ||
  flags.some((flag) => flag !== '--gpu') ||
  (command !== 'up' && gpu)
) {
  console.error(USAGE);
  process.exit(2);
}

const files = ['compose.yaml', ...(gpu ? ['compose.gpu.yaml'] : [])].flatMap((file) => [
  '-f',
  path.join(import.meta.dirname, file),
]);

/** Runs `docker compose <files> <args>` and answers its exit status. */
function compose(...args) {
  const result = spawnSync('docker', ['compose', ...files, ...args], { stdio: 'inherit' });
  if (result.error !== undefined) {
    console.error(`Could not run docker (${result.error.message}); is Docker installed?`);
    process.exit(1);
  }

  return result.status ?? 1;
}

let status;
if (command === 'status') {
  // The containers, then the models pulled into the volume (empty while the pull still runs).
  status = compose('ps', '--all');
  status = status === 0 ? compose('exec', 'ollama', 'ollama', 'list') : status;
} else {
  // `up` recreates the container when switching between CPU and GPU; the model volume stays.
  status = compose(...(command === 'up' ? ['up', '-d'] : ['down']));
  if (gpu && status !== 0) {
    console.error('GPU start failed; `pnpm docs:embeddings:up` runs on CPU.');
  }
}

process.exit(status);
