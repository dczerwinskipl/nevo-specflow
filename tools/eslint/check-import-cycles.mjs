// Import-cycle gate for the Engine's Specification slices (run by the Engine `lint` script).
//
// Builds the module graph of `packages/specflow-engine/src` (relative imports, type imports
// included, test files excluded), finds the strongly connected components and fails when a cycle
// touches a gated slice: `specs/documents`, `specs/archetypes`, `specs/model.ts`, `specs/scaffold.ts`
// or `specs/create`. A cycle that touches none of them (the lifecycle one that predates the gate) is
// reported as informational only. One known `specs/create` cycle is accepted by its exact member
// list; it must not grow, and any new cycle through a gated slice fails.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');

const src = path.join(root, 'packages', 'specflow-engine', 'src');

const GATED = [
  'specs/documents/',
  'specs/archetypes/',
  'specs/create/',
  'specs/model.ts',
  'specs/scaffold.ts',
];

/** Cycles that exist today and touch a gated slice; the exact member list, relative to `src`. */
const ACCEPTED = [
  ['specs/create/index.ts', 'specs/create/inspect/inspection.ts', 'specs/operations/projection.ts'],
];

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) files.push(...sourceFiles(full));
    else if (/\.ts$/u.test(entry) && !/\.(test|d)\.ts$/u.test(entry)) files.push(full);
  }
  return files;
}

const files = new Set(sourceFiles(src));

function resolveImport(from, specifier) {
  if (!specifier.startsWith('.')) return undefined;
  const base = path.resolve(path.dirname(from), specifier);
  for (const candidate of [base + '.ts', path.join(base, 'index.ts')]) {
    if (files.has(candidate)) return candidate;
  }
  return undefined;
}

const graph = new Map();
for (const file of files) {
  const info = ts.preProcessFile(readFileSync(file, 'utf8'), true, false);
  const targets = new Set();
  for (const reference of info.importedFiles) {
    const target = resolveImport(file, reference.fileName);
    if (target && target !== file) targets.add(target);
  }
  graph.set(file, [...targets]);
}

// Tarjan's strongly connected components.
let counter = 0;
const index = new Map();
const low = new Map();
const stack = [];
const onStack = new Set();
const components = [];
function connect(node) {
  index.set(node, counter);
  low.set(node, counter);
  counter += 1;
  stack.push(node);
  onStack.add(node);
  for (const next of graph.get(node) ?? []) {
    if (!index.has(next)) {
      connect(next);
      low.set(node, Math.min(low.get(node), low.get(next)));
    } else if (onStack.has(next)) {
      low.set(node, Math.min(low.get(node), index.get(next)));
    }
  }
  if (low.get(node) === index.get(node)) {
    const component = [];
    let member;
    do {
      member = stack.pop();
      onStack.delete(member);
      component.push(member);
    } while (member !== node);
    if (component.length > 1) components.push(component);
  }
}
for (const node of graph.keys()) if (!index.has(node)) connect(node);

const relative = (file) => path.relative(src, file).split(path.sep).join('/');
let failed = false;
for (const component of components) {
  const members = component.map(relative).sort();
  const gated = members.some((member) => GATED.some((prefix) => member.startsWith(prefix)));
  const accepted = ACCEPTED.some(
    (known) => known.length === members.length && known.every((member, i) => member === members[i]),
  );
  if (gated && !accepted) {
    failed = true;
    console.error('Import cycle through a gated Specification slice:\n  ' + members.join('\n  '));
  } else {
    console.log(
      (accepted ? 'Accepted' : 'Ungated') + ' import cycle (' + members.length + ' modules).',
    );
  }
}
if (failed) process.exit(1);
console.log('Engine import cycles: none new in ' + GATED.join(', ') + '.');
