#!/usr/bin/env node
import process from 'node:process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';

import { buildAgents, checkAgents, parseProviders } from './generate.js';
import type { ContentMode } from './model.js';
import { findRepoRoot } from './repo.js';

function parseContent(value: string): ContentMode {
  if (value === 'embed' || value === 'reference') return value;
  throw new Error(`--content must be 'embed' or 'reference'`);
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
const program = new Command('nevo-agents').description(
  'Validate canonical Nevo agent profiles and build provider skill projections',
);

program
  .command('build')
  .description('Build generated provider skills from canonical agent definitions')
  .option('--providers <providers>', 'comma-separated: claude,codex,antigravity')
  .option(
    '--content <mode>',
    'delivery for instructions declared as auto: embed or reference',
    'embed',
  )
  .action((opts: { providers?: string; content: string }) => {
    const providers = parseProviders(opts.providers);
    const content = parseContent(opts.content);
    buildAgents(repoRoot, providers, content);
    process.stdout.write(`OK — built ${providers.join(', ')} agent projections (${content})\n`);
  });

program
  .command('check')
  .description('Fail when generated provider skills are missing or stale')
  .option('--providers <providers>', 'comma-separated: claude,codex,antigravity')
  .option(
    '--content <mode>',
    'delivery for instructions declared as auto: embed or reference',
    'embed',
  )
  .action((opts: { providers?: string; content: string }) => {
    const providers = parseProviders(opts.providers);
    const content = parseContent(opts.content);
    const problems = checkAgents(repoRoot, providers, content);
    if (problems.length) {
      for (const problem of problems) process.stderr.write(`${problem}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`OK — generated agent projections are current (${content})\n`);
  });

await program.parseAsync(process.argv);
