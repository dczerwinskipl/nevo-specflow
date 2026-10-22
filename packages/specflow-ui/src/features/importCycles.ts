import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/**
 * Static analysis of the import graph of the feature sources (relative imports only, type-only
 * imports included: a design cycle is a cycle whether or not the compiler erases it). Used by the
 * module-graph test; it does not depend on the app.
 *
 * A feature is not one node. Its parts that others may depend on differ in weight, so the graph is
 * made of:
 * - `<feature>`: the screens and behaviour behind the public barrel (`index.ts`);
 * - `<feature>/read-model`: data others may depend on (types, query keys, the read hook); a leaf;
 * - `<feature>/composition`: what the application wires in (`routes`, `uiModule`, `contributions/`).
 * Features may depend on each other as long as these nodes form no cycle, which keeps "a feature
 * only needs another feature's data" from becoming "a feature needs another feature's UI".
 */

const sourcePattern = /\.tsx?$/;
const nonProduction = /\.(test|stories)\.tsx?$/;
const specifierPattern =
  /(?:^|\n)\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;

export function productionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'test-support' ? [] : productionSources(path);
    return sourcePattern.test(entry.name) &&
      !nonProduction.test(entry.name) &&
      !/\.(stories-support|test-support)\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

function resolveRelative(from: string, specifier: string): string | undefined {
  const base = resolve(dirname(from), specifier);
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
    base,
  ];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

/** file -> files it imports (only files inside `files`). */
export function importGraph(files: readonly string[]): Map<string, string[]> {
  const known = new Set(files);
  return new Map(
    files.map((file) => {
      const source = readFileSync(file, 'utf8');
      const targets = new Set<string>();
      for (const match of source.matchAll(specifierPattern)) {
        const specifier = match[1] ?? match[2];
        if (!specifier?.startsWith('.')) continue;
        const target = resolveRelative(file, specifier);
        if (target && known.has(target) && target !== file) targets.add(target);
      }
      return [file, [...targets]];
    }),
  );
}

const compositionPattern = /(?:^|\/)(?:routes|uiModule)\.tsx?$|^contributions\//;

/** The node a source file belongs to; `path` is relative to the features directory. */
export function featureNode(path: string): string {
  const [feature = '', ...rest] = path.split('/');
  const inside = rest.join('/');
  if (inside.startsWith('read-model/')) return `${feature}/read-model`;
  if (compositionPattern.test(inside)) return `${feature}/composition`;
  return feature;
}

export const isCompositionNode = (node: string): boolean => node.endsWith('/composition');

/** node -> nodes it depends on, between different nodes only. */
export function nodeGraph(root: string): Map<string, Set<string>> {
  const files = productionSources(root);
  const rel = (file: string) => relative(root, file).split(sep).join('/');
  const nodes = new Map<string, Set<string>>();
  for (const [file, targets] of importGraph(files)) {
    const from = featureNode(rel(file));
    const edges = nodes.get(from) ?? new Set<string>();
    nodes.set(from, edges);
    for (const target of targets) {
      const to = featureNode(rel(target));
      if (to !== from) edges.add(to);
    }
  }
  return nodes;
}

/** Strongly connected components with more than one member (Tarjan), each as a sorted list. */
export function cycles(graph: ReadonlyMap<string, Iterable<string>>): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const found: string[][] = [];
  let counter = 0;

  const visit = (node: string): void => {
    index.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node) ?? 0, low.get(next) ?? 0));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node) ?? 0, index.get(next) ?? 0));
      }
    }
    if (low.get(node) === index.get(node)) {
      const component: string[] = [];
      let member: string | undefined;
      do {
        member = stack.pop();
        if (member === undefined) break;
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1) found.push(component.sort());
    }
  };

  for (const node of graph.keys()) if (!index.has(node)) visit(node);
  return found;
}

/** Import cycles between source files (a cycle inside one feature counts too). */
export function fileCycles(root: string): string[][] {
  const graph = new Map(
    [...importGraph(productionSources(root))].map(([file, targets]) => [
      relative(root, file).split(sep).join('/'),
      targets.map((target) => relative(root, target).split(sep).join('/')),
    ]),
  );
  return cycles(graph);
}
