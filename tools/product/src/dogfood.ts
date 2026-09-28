// `nevo-repo-product dogfood` — build + pack the real distributable, install
// that tarball globally with pnpm, and smoke the installed `nevo-specflow`.

import { delimiter } from 'node:path';

import { run, StepFailedError } from './exec.js';
import { RUNTIME_BOOTSTRAP_MARKER } from './markers.js';
import { packProduct, type PackResult } from './pack.js';
import { findRepoRoot } from './paths.js';

export interface DogfoodResult extends PackResult {
  readonly globalBinDir: string;
  readonly checks: readonly string[];
}

export async function dogfoodInstall(
  opts: { env?: NodeJS.ProcessEnv; log?: (line: string) => void } = {},
): Promise<DogfoodResult> {
  const log = opts.log ?? (() => undefined);
  const repoRoot = findRepoRoot(process.cwd());

  const packed = await packProduct({ env: opts.env, log });

  log(`installing globally: pnpm add -g ${packed.tarball}`);
  run('pnpm', ['add', '-g', packed.tarball], { cwd: repoRoot, env: opts.env });

  const globalBinDir = run('pnpm', ['bin', '-g'], { cwd: repoRoot, env: opts.env });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...opts.env,
    PATH: `${globalBinDir}${delimiter}${process.env.PATH ?? ''}`,
  };

  const nevoSpecFlow = (args: string[]): string => run('nevo-specflow', args, { env });
  const checks: string[] = [];

  const version = nevoSpecFlow(['--version']);
  if (version !== packed.version) {
    throw new StepFailedError(
      `installed \`nevo-specflow --version\` printed ${JSON.stringify(version)}, ` +
        `expected the packed version ${JSON.stringify(packed.version)}`,
    );
  }
  checks.push(`nevo-specflow --version -> ${version}`);

  const help = nevoSpecFlow(['--help']);
  for (const needle of ['nevo-specflow', 'start']) {
    if (!help.includes(needle)) {
      throw new StepFailedError(
        `\`nevo-specflow --help\` is missing ${JSON.stringify(needle)}:\n${help}`,
      );
    }
  }
  checks.push('nevo-specflow --help -> ok');

  const start = nevoSpecFlow(['start']);
  if (!start.includes(RUNTIME_BOOTSTRAP_MARKER)) {
    throw new StepFailedError(
      `\`nevo-specflow start\` did not run the Runtime capability ` +
        `(expected ${JSON.stringify(RUNTIME_BOOTSTRAP_MARKER)}):\n${start}`,
    );
  }
  checks.push('nevo-specflow start -> Runtime capability ran');

  return { ...packed, globalBinDir, checks };
}
