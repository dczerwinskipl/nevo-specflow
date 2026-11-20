import { beforeAll, describe, expect, it } from 'vitest';

import type { TaskContextEntry } from '../../../tasks/resource/model';
import type { ExecutionCatalogue } from '../../definitions/catalogue';
import {
  AGENT_CONTEXT_DOCUMENTS_MAX,
  AGENT_CONTEXT_INSTRUCTIONS_BYTES_MAX,
  AGENT_CONTEXT_REFERENCE_BYTES_MAX,
} from '../../limits';
import {
  SPEC,
  claude,
  fakeReferences,
  memoryDependencies,
  seedExecutionCatalogue,
  specification,
  startSpecification,
} from '../../operations/operations.test-support';
import type { ExecutionTask } from '../../state/model';
import { compileAgentContext } from './compile';
import { gatherAgentContext, type AgentContextSource } from './gather';
import { readStepContext } from './read';
import type { ContextDocument, ContextEntryFact } from '../../operations/agent-step-context';

const file = (path: string, sha256 = 'a'.repeat(64), bytes = 10) => ({ path, bytes, sha256 });
const overview: TaskContextEntry = {
  kind: 'specification-document',
  id: 'overview',
  required: true,
};
const fact = (entry: TaskContextEntry, path?: string): ContextEntryFact => ({
  entry,
  found: path ? { file: file(path) } : {},
});
const document: ContextDocument = {
  id: 'overview',
  type: 'overview',
  title: 'Overview',
  path: 'specs/a/b/overview.md',
  revision: 'r',
  templateOnly: true,
};
const base = { documents: [document], documentTypes: [] };

describe('compileAgentContext', () => {
  it('keeps the declared order, inlines only instructions and digests the resolved list', () => {
    const entries: ContextEntryFact[] = [
      fact({ kind: 'path', path: 'src/z.ts', required: true }, 'src/z.ts'),
      fact({ kind: 'instructions', text: 'Be brief.', required: false }),
      fact(overview, document.path),
      fact({ kind: 'project-document', id: 'a.b', required: false }),
    ];
    const context = compileAgentContext({ ...base, taskId: 't', entries });

    expect(context.taskContext?.entries).toEqual([
      {
        kind: 'path',
        ref: 'src/z.ts',
        path: 'src/z.ts',
        bytes: 10,
        sha256: 'a'.repeat(64),
        required: true,
      },
      { kind: 'instructions', text: 'Be brief.', required: false },
      {
        kind: 'specification-document',
        ref: 'overview',
        path: document.path,
        bytes: 10,
        sha256: 'a'.repeat(64),
        required: true,
      },
      { kind: 'project-document', ref: 'a.b', required: false },
    ]);
    expect(compileAgentContext({ ...base, taskId: 't', entries }).taskContext?.digest).toBe(
      context.taskContext?.digest,
    );
    const changed = [
      { entry: entries[0]!.entry, found: { file: file('src/z.ts', 'b'.repeat(64)) } },
      ...entries.slice(1),
    ];
    expect(
      compileAgentContext({ ...base, taskId: 't', entries: changed }).taskContext?.digest,
    ).not.toBe(context.taskContext?.digest);
  });

  it('marks an optional reference that does not resolve and refuses a required one (B7)', () => {
    const optional = compileAgentContext({
      ...base,
      taskId: 't',
      entries: [{ entry: { ...overview, required: false } }],
    });
    expect(optional.taskContext?.entries).toEqual([
      { kind: 'specification-document', ref: 'overview', required: false, missing: true },
    ]);

    const required = () =>
      compileAgentContext({
        ...base,
        taskId: 't',
        entries: [{ entry: { kind: 'specification-document', id: 'overviw', required: true } }],
      });
    expect(required).toThrow(/WORKFLOW_TASK_CONTEXT_UNRESOLVED|specification-document "overviw"/u);
    expect(required).toThrow(
      /field "id" takes a document id registered in the Specification, such as "overview"/u,
    );
  });

  it('names the field and the accepted form of each reference kind (B7)', () => {
    const message = (entry: TaskContextEntry): string => {
      try {
        compileAgentContext({ ...base, taskId: 't', entries: [{ entry }] });
      } catch (error) {
        return (error as Error).message;
      }

      return '';
    };

    expect(message({ kind: 'path', path: '/abs', required: true })).toContain('field "path"');
    expect(message({ kind: 'project-document', id: 'x', required: true })).toContain(
      'project-doc:<id>',
    );
    expect(message({ kind: 'task-document', id: 'x', required: true })).toContain('task-doc:task');
  });

  it('refuses a context over a budget instead of cutting it', () => {
    const many = Array.from({ length: AGENT_CONTEXT_DOCUMENTS_MAX + 1 }, () => document);
    expect(() => compileAgentContext({ documents: many, documentTypes: [] })).toThrow(/budget/u);

    const long = 'x'.repeat(AGENT_CONTEXT_INSTRUCTIONS_BYTES_MAX + 1);
    expect(() =>
      compileAgentContext({
        ...base,
        taskId: 't',
        entries: [fact({ kind: 'instructions', text: long, required: true })],
      }),
    ).toThrow(/inline instructions/u);

    expect(() =>
      compileAgentContext({
        ...base,
        taskId: 't',
        entries: [
          {
            entry: overview,
            found: { file: { path: document.path, bytes: AGENT_CONTEXT_REFERENCE_BYTES_MAX + 1 } },
          },
        ],
      }),
    ).toThrow(/overview/u);
  });
});

describe('agent context of a step', () => {
  let catalogue: ExecutionCatalogue;
  beforeAll(async () => {
    catalogue = await seedExecutionCatalogue();
  });

  const source: AgentContextSource = {
    documents: () => Promise.resolve([document]),
    catalogue: () =>
      Promise.resolve({
        documentTypes: [
          {
            id: 'decisions',
            title: 'Decisions',
            useWhen: 'x',
            instructions: 'Record.',
            defaultFilename: 'decisions.md',
          },
        ],
      }),
    documentFile: () => Promise.resolve(file(document.path)),
    checkoutFile: () => Promise.resolve(undefined),
  };

  it('reads the context of the active attempt, read-only', async () => {
    const dependencies = memoryDependencies(catalogue);
    await startSpecification(dependencies, claude);
    const applied = dependencies.store.applied.length;
    const context = await readStepContext(dependencies, source, specification);

    expect(context).toMatchObject({
      attempt: 1,
      agent: { documents: [{ id: 'overview' }], documentTypes: [{ id: 'decisions' }] },
    });
    expect(dependencies.store.applied).toHaveLength(applied);
  });

  it('resolves the default context of a Task: its documents, then the overview', async () => {
    const references = fakeReferences();
    const task = {
      specId: SPEC,
      taskId: 't',
      documents: [{ id: 'task', path: 'task.md', type: 'task' }],
    } as unknown as ExecutionTask;
    const context = await gatherAgentContext(
      { references },
      source,
      { kind: 'task', specId: SPEC, taskId: 't' },
      task,
    );

    expect(
      context.taskContext?.entries.map((entry) =>
        entry.kind === 'instructions' ? entry.kind : entry.ref,
      ),
    ).toEqual(['task', 'overview']);
  });
});
