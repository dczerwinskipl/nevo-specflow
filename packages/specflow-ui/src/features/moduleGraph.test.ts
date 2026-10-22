import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cycles, featureNode, fileCycles, isCompositionNode, nodeGraph } from './importCycles';

const root = fileURLToPath(new URL('.', import.meta.url));
const features = new Set(['documents', 'git', 'sessions', 'specs', 'tasks']);
const graph = nodeGraph(root);
const edges = [...graph].flatMap(([from, targets]) => [...targets].map((to) => ({ from, to })));
const featureEdges = edges.filter(({ to }) => features.has(to.split('/')[0] ?? ''));

describe('module graph of the features', () => {
  it('has no import cycle between features (screens, read models and composition)', () => {
    expect(cycles(graph)).toEqual([]);
  });

  it('has no import cycle between files', () => {
    expect(fileCycles(root)).toEqual([]);
  });

  it('keeps read models leaves: they depend only on other read models', () => {
    expect(
      featureEdges.filter(
        ({ from, to }) => from.endsWith('/read-model') && !to.endsWith('/read-model'),
      ),
    ).toEqual([]);
  });

  it('lets only composition files depend on composition files of other features', () => {
    expect(
      edges.filter(
        ({ from, to }) =>
          isCompositionNode(to) &&
          !isCompositionNode(from) &&
          from.split('/')[0] !== to.split('/')[0],
      ),
    ).toEqual([]);
  });

  it('keeps screens independent of their own feature composition files', () => {
    expect(
      edges.filter(
        ({ from, to }) =>
          isCompositionNode(to) &&
          !isCompositionNode(from) &&
          from.split('/')[0] === to.split('/')[0],
      ),
    ).toEqual([]);
  });
});

describe('cycle detection', () => {
  it('finds a cycle through three nodes and ignores an acyclic chain', () => {
    const found = cycles(
      new Map([
        ['a', ['b']],
        ['b', ['c']],
        ['c', ['a']],
        ['d', ['a']],
      ]),
    );
    expect(found).toEqual([['a', 'b', 'c']]);
  });

  it('assigns read-model and composition files to their own node', () => {
    expect(featureNode('specs/read-model/queries.ts')).toBe('specs/read-model');
    expect(featureNode('tasks/routes.tsx')).toBe('tasks/composition');
    expect(featureNode('git/contributions/specification-work/RepositorySection.tsx')).toBe(
      'git/composition',
    );
    expect(featureNode('documents/content/DocumentContent.tsx')).toBe('documents');
  });
});
