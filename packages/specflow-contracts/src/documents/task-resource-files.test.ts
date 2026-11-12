import type { TSchema } from 'typebox';
import { Compile } from 'typebox/compile';
import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import taskIndexSchema from '../../schema/task-resource/task-index.v1.schema.json';
import taskIndexSchemaText from '../../schema/task-resource/task-index.v1.schema.json?raw';
import taskManifestSchema from '../../schema/task-resource/task-manifest.v1.schema.json';
import taskManifestSchemaText from '../../schema/task-resource/task-manifest.v1.schema.json?raw';
import {
  TASK_CONTEXT_ENTRIES_MAX,
  TASK_TITLE_MAX_LENGTH,
  TaskIndexFileSchema,
  TaskManifestFileSchema,
  createTaskResourceJsonSchema,
  serializeTaskResourceJsonSchema,
  taskResourceSchemaId,
  type TaskIndexFile,
  type TaskManifestFile,
  type TaskResourceFile,
} from './task-resource-files';

const index = (): TaskIndexFile => ({
  schemaVersion: 1,
  tasks: [{ id: 'activity-core-model' }, { id: 'activity-local-store' }],
});

const manifest = (): TaskManifestFile => ({
  schemaVersion: 1,
  id: 'activity-local-store',
  title: 'Local activity store',
  summary: 'Persist activities locally.',
  type: 'implementation',
  status: 'draft',
  dependsOn: ['activity-core-model'],
  origin: { kind: 'produced', step: 'breakdown', attempt: 1 },
  documents: [{ id: 'task', path: 'task.md', type: 'task' }],
  context: [
    { kind: 'specification-document', id: 'overview', required: true },
    { kind: 'project-document', id: 'architecture.workflow.workflow-kernel', required: false },
    { kind: 'path', path: 'packages/specflow-engine/src/**/*.ts', required: true, note: 'Code.' },
    { kind: 'instructions', text: 'Keep the store pure.', required: true },
  ],
});

type Build<T> = readonly [string, () => T];

interface Case {
  readonly file: TaskResourceFile;
  readonly schema: TSchema;
  readonly valid: () => unknown;
  readonly invalid: readonly Build<unknown>[];
  readonly committed: { readonly $schema?: string; readonly $id?: string };
  readonly committedText: string;
}

const CASES: readonly Case[] = [
  {
    file: 'task-index',
    schema: TaskIndexFileSchema,
    valid: index,
    invalid: [
      ['another schema version', () => ({ ...index(), schemaVersion: 2 })],
      ['an entry with more than its id', () => ({ ...index(), tasks: [{ id: 'a', title: 'A' }] })],
      ['an invalid Task id', () => ({ ...index(), tasks: [{ id: 'Not valid' }] })],
      ['a Windows device name', () => ({ ...index(), tasks: [{ id: 'con' }] })],
      ['an unknown key', () => ({ ...index(), order: [] })],
    ] satisfies Build<unknown>[],
    committed: taskIndexSchema,
    committedText: taskIndexSchemaText,
  },
  {
    file: 'task-manifest',
    schema: TaskManifestFileSchema,
    valid: manifest,
    invalid: [
      ['an unknown status', () => ({ ...manifest(), status: 'blocked' })],
      [
        'a title over its limit',
        () => ({ ...manifest(), title: 'x'.repeat(TASK_TITLE_MAX_LENGTH + 1) }),
      ],
      ['an untagged origin', () => ({ ...manifest(), origin: { step: 'breakdown', attempt: 1 } })],
      ['a manual origin without actor', () => ({ ...manifest(), origin: { kind: 'manual' } })],
      ['a duplicated dependency', () => ({ ...manifest(), dependsOn: ['a', 'a'] })],
      ['no documents', () => ({ ...manifest(), documents: [] })],
      [
        'an unknown context kind',
        () => ({ ...manifest(), context: [{ kind: 'path-hint', allowed: [], required: true }] }),
      ],
      [
        'a context entry without required',
        () => ({ ...manifest(), context: [{ kind: 'task-document', id: 'task' }] }),
      ],
      [
        'a context entry with the field of another kind',
        () => ({ ...manifest(), context: [{ kind: 'path', id: 'overview', required: true }] }),
      ],
      [
        'more context entries than allowed',
        () => ({
          ...manifest(),
          context: Array.from({ length: TASK_CONTEXT_ENTRIES_MAX + 1 }, () => ({
            kind: 'instructions',
            text: 'x',
            required: false,
          })),
        }),
      ],
      ['a run inside the manifest', () => ({ ...manifest(), run: {} })],
    ] satisfies Build<unknown>[],
    committed: taskManifestSchema,
    committedText: taskManifestSchemaText,
  },
];

describe('Task resource files', () => {
  it('accepts a manual origin and a manifest without explicit context', () => {
    const { context: _context, summary: _summary, ...rest } = manifest();
    expect(
      Value.Check(TaskManifestFileSchema, {
        ...rest,
        origin: { kind: 'manual', actorId: 'local:dominik' },
      }),
    ).toBe(true);
  });

  describe.each(CASES)('$file', ({ file, schema, valid, invalid, committed, committedText }) => {
    const compiled = Compile(schema);

    it('accepts the example', () => {
      expect(Value.Check(schema, valid())).toBe(true);
    });

    it.each(invalid)('rejects %s', (_name, build) => {
      expect(Value.Check(schema, build())).toBe(false);
    });

    it('publishes a JSON Schema equal to the committed file (no drift)', () => {
      expect(committed.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(committed.$id).toBe(taskResourceSchemaId(file));
      expect(JSON.stringify(committed)).toBe(JSON.stringify(createTaskResourceJsonSchema(file)));
      expect(committedText).toBe(serializeTaskResourceJsonSchema(file));
    });

    it('validates the example and rejects the same cases through the published schema', () => {
      expect(compiled.Check(valid())).toBe(true);
      for (const [, build] of invalid) {
        expect(compiled.Check(build())).toBe(false);
      }
    });
  });
});
