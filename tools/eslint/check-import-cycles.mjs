// Import-cycle gate for the Engine's Specification slices (run by the Engine `lint` script).
//
// Builds the module graph of `packages/specflow-engine/src` (relative imports, type imports
// included, test files excluded), finds the strongly connected components and fails when a cycle
// touches a gated slice: `specs/document-rules`, `specs/documents`, `specs/archetypes`, `specs/definitions`, `specs/durable`, `specs/uncommitted`, `specs/manual-commit`, `specs/model.ts`,
// `specs/scaffold.ts`, `specs/create` or `version-control/commits`. A cycle that touches none of them (the lifecycle one that predates the gate) is
// reported as informational only. One known `specs/create` cycle is accepted by its exact member
// list; it must not grow, and any new cycle through a gated slice fails.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');

const src = path.join(root, 'packages', 'specflow-engine', 'src');

/**
 * The generic durable core knows no operation kind: a module below `specs/durable` must not import
 * the Create or the documents slice (a kind depends on the core, never the reverse).
 */
const FORBIDDEN_EDGES = [
  { from: 'specs/durable/', to: ['specs/create/', 'specs/documents/', 'specs/manual-commit/'] },
  // The uncommitted-changes ledger is data: it knows no Git (callers pass the probe of "equals HEAD")
  // and no application object, so every capability can use it without a dependency on another.
  {
    from: 'specs/durable/ledger/',
    to: ['specs/uncommitted/', 'version-control/', 'git/', 'application', 'specs/lifecycle/'],
  },
  // What the Engine does with the ledger for every capability (prune against HEAD, the hold Close
  // reads) sits on the durable core and the commit port; a capability depends on it, never the reverse.
  {
    from: 'specs/uncommitted/',
    to: [
      'specs/create/',
      'specs/documents/',
      'specs/definitions/',
      'specs/archetypes/',
      'specs/lifecycle/',
      'specs/operations/',
      'specs/coordination/',
      'specs/scaffold.ts',
    ],
  },
  // The manual commit (ADR 0018) sits on the durable core (journal store, lease, ledger) and the
  // commit port, like the document queue it shares the lease with. It knows no operation kind of
  // another slice: the Specification it serves and the document queue it must not run beside reach it
  // through ports the composition (`documents/manual-commit`) supplies, and the Runtime and the CLI
  // are other packages. It reads the ledger only through the durable core.
  {
    from: 'specs/manual-commit/',
    to: [
      'specs/create/',
      'specs/documents/',
      'specs/definitions/',
      'specs/archetypes/',
      'specs/lifecycle/',
      'specs/operations/',
      'specs/coordination/',
      'specs/uncommitted/',
      'specs/scaffold.ts',
    ],
  },
  // The definitions loader and the resolved catalogue are read-only configuration: Create, the
  // scaffold, the archetype projection and the documents readers depend on them, never the reverse.
  {
    from: 'specs/definitions/',
    to: ['specs/create/', 'specs/archetypes/', 'specs/scaffold.ts', 'specs/documents/'],
  },
  // The pure document rules are the lowest slice: both the documents layer and the definitions
  // loader depend on them, so they import no other Specification slice.
  {
    from: 'specs/document-rules/',
    to: ['specs/documents/', 'specs/definitions/', 'specs/create/', 'specs/archetypes/'],
  },
  // The document-change model (planners, journals, codecs, fingerprint, claims) is pure: the writer,
  // the queue and the Runtime consume it, it consumes none of them. It depends on the pure rules,
  // the durable core's claim algebra and journal types, and the pure commit policy only; never on
  // Create, the definitions loader, the archetypes, the lifecycle, the project/Git adapters or the
  // commit port's adapter.
  {
    from: 'specs/documents/changes/',
    to: [
      'specs/create/',
      'specs/definitions/',
      'specs/archetypes/',
      'specs/lifecycle/',
      'specs/operations/',
      'specs/coordination/',
      'specs/documents/write/',
      'specs/documents/queue/',
      'specs/scaffold.ts',
      'project/',
      'git/',
      'application',
      'version-control/git/',
      'version-control/commits/git-adapter',
      'version-control/commits/port',
      'version-control/commits/path-facts',
    ],
  },
  // The effectful half of document writes (admission, claim source, later the writer and the queue)
  // sits on the pure model and the durable core. Coordination imports its claim source, so it must
  // never import coordination, Create, the lifecycle (Close) or the catalogue slices back.
  {
    from: 'specs/documents/write/',
    to: [
      'specs/documents/queue/',
      'specs/documents/templates/',
      'specs/create/',
      'specs/definitions/',
      'specs/archetypes/',
      'specs/lifecycle/',
      'specs/operations/',
      'specs/coordination/',
      'specs/scaffold.ts',
    ],
  },
  // Rendering the templates of a create in an existing Specification reads the project catalogue and
  // the template renderer, so it is the one documents module that may import the definitions and the
  // archetypes. The writer reaches it only through the TemplateResolver port that the composition
  // (documents/api) supplies; it imports none of the writer, the queue, the readers, the scheduler,
  // Create, the lifecycle or the coordination.
  {
    from: 'specs/documents/templates/',
    to: [
      'specs/documents/queue/',
      'specs/documents/reads/',
      'specs/documents/scheduler/',
      'specs/documents/write/admission',
      'specs/documents/write/writer',
      'specs/create/',
      'specs/lifecycle/',
      'specs/operations/',
      'specs/coordination/',
      'specs/scaffold.ts',
    ],
  },
  // The commit queue sits on the writer's journal store, the durable core and the commit port. It is
  // consumed by the composition (documents/api), the scheduler and the Runtime, and imports none of
  // the Create, definitions, archetype, lifecycle or coordination slices.
  {
    from: 'specs/documents/queue/',
    to: [
      'specs/create/',
      'specs/definitions/',
      'specs/archetypes/',
      'specs/lifecycle/',
      'specs/operations/',
      'specs/coordination/',
      'specs/scaffold.ts',
    ],
  },
  // The scheduler sits on the queue and the writer's entry points (the composition documents/api
  // announces finished writes to it through the notifier). It has no transport: it never imports the
  // lifecycle, Create, the definitions, the archetypes or the coordination, and nothing below it
  // imports it back (only the notifier is reached from the composition).
  {
    from: 'specs/documents/scheduler/',
    to: [
      'specs/create/',
      'specs/definitions/',
      'specs/archetypes/',
      'specs/lifecycle/',
      'specs/operations/',
      'specs/coordination/',
      'specs/scaffold.ts',
    ],
  },
  // The read side of the queue (commit state of the tree, the operation status and the list rows)
  // takes no lock and starts no Git process: it sits on the pure model, the durable core, the
  // journal and batch stores and the executor proof, and imports no module that writes or commits
  // (the writer, the reservation, the file effects, the admission, the claim, the worker, the
  // failure handling, the actions, the lease, the scheduler) nor any other Specification slice.
  {
    from: 'specs/documents/reads/',
    to: [
      'specs/create/',
      'specs/definitions/',
      'specs/archetypes/',
      'specs/lifecycle/',
      'specs/operations/',
      'specs/coordination/',
      'specs/scaffold.ts',
      'specs/documents/scheduler/',
      'specs/documents/write/admission',
      'specs/documents/write/file-effects',
      'specs/documents/write/git-preflight',
      'specs/documents/write/index',
      'specs/documents/write/preflight-cache',
      'specs/documents/write/reservation.ts',
      'specs/documents/write/write-phase',
      'specs/documents/write/writer',
      'specs/documents/queue/abandon',
      'specs/documents/queue/actions',
      'specs/documents/queue/attempt',
      'specs/documents/queue/claim',
      'specs/documents/queue/flush',
      'specs/documents/queue/index',
      'specs/documents/queue/lease',
      'specs/documents/queue/runtime',
      'specs/documents/queue/settlement',
      'specs/documents/queue/failure',
      'specs/documents/queue/worker',
      'git/',
      'version-control/',
    ],
  },
  // Nothing that writes imports the read side back.
  {
    from: 'specs/documents/write/',
    to: ['specs/documents/reads/'],
  },
  {
    from: 'specs/documents/queue/',
    to: ['specs/documents/reads/'],
  },
  {
    from: 'specs/documents/changes/',
    to: ['specs/documents/reads/'],
  },
  {
    from: 'specs/documents/write/',
    to: ['specs/documents/scheduler/'],
  },
];

/**
 * Slices that perform no I/O: a module below one of them must not import a Node module that reaches
 * the filesystem, a process or the network.
 */
const PURE_SLICES = ['specs/documents/changes/'];
const IO_MODULES =
  /^(?:node:)?(?:fs|fs\/promises|child_process|net|http|https|dgram|os|readline|worker_threads)$/u;

const GATED = [
  'specs/document-rules/',
  'specs/documents/',
  'specs/archetypes/',
  'specs/definitions/',
  'specs/durable/',
  'specs/uncommitted/',
  'specs/manual-commit/',
  'specs/create/',
  'specs/model.ts',
  'specs/scaffold.ts',
  'version-control/commits/',
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
for (const [file, targets] of graph) {
  for (const rule of FORBIDDEN_EDGES) {
    if (!relative(file).startsWith(rule.from)) continue;
    for (const target of targets) {
      if (rule.to.some((prefix) => relative(target).startsWith(prefix))) {
        failed = true;
        console.error(
          'Forbidden import: ' + relative(file) + ' must not import ' + relative(target) + '.',
        );
      }
    }
  }
}
for (const file of files) {
  if (!PURE_SLICES.some((prefix) => relative(file).startsWith(prefix))) continue;
  const info = ts.preProcessFile(readFileSync(file, 'utf8'), true, false);
  for (const reference of info.importedFiles) {
    if (IO_MODULES.test(reference.fileName)) {
      failed = true;
      console.error(
        'Impure import: ' + relative(file) + ' must not import ' + reference.fileName + '.',
      );
    }
  }
}
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
