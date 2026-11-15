import { describe, expect, it } from 'vitest';

import {
  contextPathProblem,
  initialTaskDocument,
  parseTaskIndex,
  parseTaskManifest,
  serializeTaskIndex,
  serializeTaskManifest,
  taskManifestProblems,
} from './codec';
import type { TaskManifest } from './model';

const manifest = (): TaskManifest => ({
  id: 'local-store',
  title: 'Local store',
  summary: 'Persist activities locally.',
  type: 'implementation',
  status: 'draft',
  dependsOn: ['core-model'],
  origin: { kind: 'produced', step: 'breakdown', attempt: 1 },
  documents: [
    { id: 'task', path: 'task.md', type: 'task' },
    { id: 'notes', path: 'notes/notes.md', type: 'note' },
  ],
  context: [
    { kind: 'task-document', id: 'notes', required: false },
    { kind: 'specification-document', id: 'overview', required: true },
    { kind: 'project-document', id: 'architecture.workflow.workflow-kernel', required: true },
    { kind: 'path', path: 'packages/specflow-engine/src/**/*.ts', required: true, note: 'Code.' },
    { kind: 'instructions', text: 'Keep it pure.', required: true },
  ],
});

const corrupt = { code: 'WORKFLOW_STATE_CORRUPT' };

describe('Task index', () => {
  it('round-trips and keeps the order', () => {
    const index = { tasks: [{ id: 'b' }, { id: 'a' }] };
    const text = serializeTaskIndex(index);
    expect(text).toBe('schemaVersion: 1\ntasks:\n  - id: b\n  - id: a\n');
    expect(parseTaskIndex(text)).toEqual(index);
  });

  it.each([
    ['not YAML', 'tasks: [\n'],
    ['another version', 'schemaVersion: 2\ntasks: []\n'],
    ['a Task listed twice', 'schemaVersion: 1\ntasks:\n  - id: a\n  - id: a\n'],
    ['an entry with a title', 'schemaVersion: 1\ntasks:\n  - id: a\n    title: A\n'],
    ['an alias', 'schemaVersion: 1\ntasks:\n  - &x {id: a}\n  - *x\n'],
  ])('refuses %s', (_name, text) => {
    expect(() => parseTaskIndex(text)).toThrow(expect.objectContaining(corrupt));
  });
});

describe('Task manifest', () => {
  it('round-trips with the stable field order', () => {
    const text = serializeTaskManifest(manifest());
    expect(text.split('\n').slice(0, 4)).toEqual([
      'schemaVersion: 1',
      'id: local-store',
      'title: Local store',
      'summary: Persist activities locally.',
    ]);
    expect(parseTaskManifest(text, 'local-store')).toEqual(manifest());
  });

  it('accepts a manual origin and no explicit context', () => {
    const { context: _context, ...rest } = manifest();
    const value: TaskManifest = { ...rest, origin: { kind: 'manual', actorId: 'local:owner' } };
    expect(parseTaskManifest(serializeTaskManifest(value), 'local-store')).toEqual(value);
  });

  it('refuses a manifest of another folder', () => {
    expect(() => parseTaskManifest(serializeTaskManifest(manifest()), 'other')).toThrow(
      expect.objectContaining(corrupt),
    );
  });

  it.each<[string, (value: TaskManifest) => TaskManifest, string]>([
    [
      'no task document',
      (value) => ({ ...value, documents: value.documents.slice(1) }),
      'the "task" document',
    ],
    [
      'the task document at another path',
      (value) => ({ ...value, documents: [{ id: 'task', path: 'main.md', type: 'task' }] }),
      'the "task" document',
    ],
    [
      'a document registered twice by path',
      (value) => ({
        ...value,
        documents: [...value.documents, { id: 'again', path: 'Task.md', type: 'note' }],
      }),
      'registered twice',
    ],
    [
      'a document outside the folder',
      (value) => ({
        ...value,
        documents: [...value.documents, { id: 'up', path: '../overview.md', type: 'note' }],
      }),
      'invalid path',
    ],
    [
      'the manifest registered as a document',
      (value) => ({
        ...value,
        documents: [...value.documents, { id: 'manifest', path: 'task.yaml', type: 'note' }],
      }),
      'invalid path',
    ],
    [
      'a dependency on itself',
      (value) => ({ ...value, dependsOn: ['local-store'] }),
      'depends on itself',
    ],
    [
      'a context entry listed twice',
      (value) => ({
        ...value,
        context: [
          ...(value.context ?? []),
          { kind: 'instructions', text: 'Keep it pure.', required: false },
        ],
      }),
      'listed twice',
    ],
    [
      'an absolute context path',
      (value) => ({ ...value, context: [{ kind: 'path', path: '/etc/passwd', required: true }] }),
      'not relative',
    ],
  ])('reports %s', (_name, edit, problem) => {
    const value = edit(manifest());
    expect(taskManifestProblems(value).join('; ')).toContain(problem);
    expect(() => serializeTaskManifest(value)).toThrow(expect.objectContaining(corrupt));
  });

  it.each([
    ['an unknown status', (text: string) => text.replace('status: draft', 'status: blocked')],
    ['an untagged origin', (text: string) => text.replace('  kind: produced\n', '')],
    ['an unknown field', (text: string) => `${text}run: {}\n`],
    [
      'the previous record format',
      (text: string) => text.replace('schemaVersion: 1', 'version: 2'),
    ],
  ])('refuses %s on read', (_name, edit) => {
    expect(() => parseTaskManifest(edit(serializeTaskManifest(manifest())), 'local-store')).toThrow(
      expect.objectContaining(corrupt),
    );
  });

  it('refuses a manifest over the byte budget as invalid input', () => {
    const value: TaskManifest = {
      ...manifest(),
      context: Array.from({ length: 50 }, (_, index) => ({
        kind: 'instructions' as const,
        text: `${String(index)}${'x'.repeat(7990)}`,
        required: true,
      })),
    };
    expect(() => serializeTaskManifest(value)).toThrow(
      expect.objectContaining({ code: 'WORKFLOW_INPUT_INVALID' }),
    );
  });
});

describe('context paths', () => {
  it.each(['packages/specflow-engine', 'packages/**/*.ts', 'README.md', 'docs/{a,b}/*.md'])(
    'accepts %s',
    (path) => {
      expect(contextPathProblem(path)).toBeUndefined();
    },
  );

  it.each(['/abs', 'C:/x', 'a\\b', 'a//b', './a', 'a/../b', 'a/', 'a\u0000b'])(
    'refuses %s',
    (path) => {
      expect(contextPathProblem(path)).toBeDefined();
    },
  );
});

describe('initialTaskDocument', () => {
  it('holds the title and the summary', () => {
    expect(initialTaskDocument({ title: 'Local store', summary: 'Persist.' })).toBe(
      '# Local store\n\nPersist.\n',
    );
    expect(initialTaskDocument({ title: 'Local store' })).toBe('# Local store\n');
  });
});
