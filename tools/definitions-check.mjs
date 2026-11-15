// Validates this repository's own `.nevo/definitions/` with the Engine's folder validation, the
// same check as `nevo-specflow definitions validate .nevo/definitions`. The installed definitions
// belong to the project and may drift from the seeds (ADR 0017), so a broken workflow, archetype or
// task type fails `pnpm check:quality` instead of surfacing at Create. Needs the built Engine
// (`quality:build-prerequisites`).

import { join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const root = join(import.meta.dirname, '..');
const folder = join(root, '.nevo', 'definitions');
const { validateDefinitionsFolder } = await import(
  pathToFileURL(join(root, 'packages', 'specflow-engine', 'dist', 'index.js')).href
);

const report = await validateDefinitionsFolder(folder);
for (const problem of report.problems) {
  const location = problem.location ? ` ${problem.location}` : '';
  console.log(
    `${problem.severity}: ${problem.source === '' ? '.' : problem.source}${location} [${problem.code}] ${problem.message}`,
  );
}

if (report.problemsTruncated) {
  console.log('(more problems exist than are shown)');
}

if (!report.rootPresent) {
  console.error(`No definitions folder at ${folder}.`);
  process.exit(1);
}

if (report.hasErrors) {
  console.error('The repository definitions have errors.');
  process.exit(1);
}

console.log(`OK — ${folder}`);
