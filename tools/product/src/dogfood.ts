// `nevo-repo-product dogfood` — build + pack the real distributable, install
// that tarball globally with pnpm, and smoke the installed `nevo-specflow`.

import { delimiter } from 'node:path';

import { run, StepFailedError } from './exec.js';
import { packProduct, type PackResult } from './pack.js';
import { findRepoRoot } from './paths.js';

export interface DogfoodResult extends PackResult {
  readonly globalBinDir: string;
  readonly checks: readonly string[];
}

export interface DogfoodInstallOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly log?: (line: string) => void;
  readonly pack?: typeof packProduct;
  readonly runCommand?: typeof run;
}

export async function dogfoodInstall(options: DogfoodInstallOptions = {}): Promise<DogfoodResult> {
  const log = options.log ?? (() => undefined);
  const pack = options.pack ?? packProduct;
  const runCommand = options.runCommand ?? run;
  const repoRoot = findRepoRoot(process.cwd());

  const packed = await pack({ env: options.env, log });

  log(`installing globally: pnpm add -g ${packed.tarball}`);
  runCommand('pnpm', ['add', '-g', packed.tarball], { cwd: repoRoot, env: options.env });

  const globalBinDir = runCommand('pnpm', ['bin', '-g'], {
    cwd: repoRoot,
    env: options.env,
  });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...options.env,
    PATH: `${globalBinDir}${delimiter}${process.env.PATH ?? ''}`,
  };

  const nevoSpecFlow = (args: string[]): string => runCommand('nevo-specflow', args, { env });
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
  for (const needle of ['nevo-specflow', 'start', 'auth']) {
    if (!help.includes(needle)) {
      throw new StepFailedError(
        `\`nevo-specflow --help\` is missing ${JSON.stringify(needle)}:\n${help}`,
      );
    }
  }
  checks.push('nevo-specflow --help -> ok');

  const startHelp = nevoSpecFlow(['start', '--help']);
  if (!/Runtime server/iu.test(startHelp)) {
    throw new StepFailedError(
      `\`nevo-specflow start --help\` does not describe the Runtime server:\n${startHelp}`,
    );
  }
  checks.push('nevo-specflow start --help -> ok');

  return { ...packed, globalBinDir, checks };
}
