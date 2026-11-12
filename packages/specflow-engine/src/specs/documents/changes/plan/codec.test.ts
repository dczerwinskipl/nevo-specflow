import { describe, expect, it } from 'vitest';

import { DocumentError } from '../../../document-rules';
import { sha256Hex } from '../../../../hash';
import { DOCUMENT_PLAN_MAX_BYTES } from '../limits';
import { buildSnapshot, TEST_SLUG, TEST_SPEC_ID } from '../test-support';
import {
  decodePlan,
  decodePlanWithEvidence,
  encodePlan,
  planDocumentChange,
  type DocumentChangePlan,
} from './index';

const DIR = `specs/active/${TEST_SLUG}/`;

function renamePlan(): DocumentChangePlan {
  const snapshot = buildSnapshot({
    documents: [{ id: 'behaviour', path: 'behaviour.md', type: 'behaviour' }],
    files: [
      { path: 'overview.md', content: 'o' },
      { path: 'behaviour.md', content: 'b' },
    ],
  });

  return planDocumentChange(snapshot, {
    action: 'rename',
    target: { kind: 'document', documentId: 'behaviour' },
    name: 'rules.md',
    expectedRevision: snapshot.files[1]!.revision,
  }).plan;
}

function mutate(
  plan: DocumentChangePlan,
  change: (draft: Record<string, unknown>) => void,
): string {
  const draft = JSON.parse(encodePlan(plan).text) as Record<string, unknown>;
  change(draft);

  return JSON.stringify(draft);
}

describe('plan codec', () => {
  it('is canonical: the same plan always encodes to the same bytes and hash', () => {
    const first = encodePlan(renamePlan());
    const second = encodePlan(renamePlan());
    expect(first).toEqual(second);
    expect(first.sha256).toBe(sha256Hex(first.text));
    expect(first.bytes).toBe(Buffer.byteLength(first.text, 'utf8'));
    expect(decodePlanWithEvidence(first.text, first)).toEqual(renamePlan());
  });

  it('proves a stored plan against its evidence', () => {
    const encoded = encodePlan(renamePlan());
    expect(() =>
      decodePlanWithEvidence(encoded.text + ' ', { sha256: encoded.sha256, bytes: encoded.bytes }),
    ).toThrow(DocumentError);
    expect(() =>
      decodePlanWithEvidence(encoded.text, { ...encoded, sha256: 'f'.repeat(64) }),
    ).toThrow(DocumentError);
  });

  it('rejects text that is not a plan', () => {
    for (const text of ['', 'nope', '[]', '{}', 'x'.repeat(DOCUMENT_PLAN_MAX_BYTES + 1)]) {
      expect(() => decodePlan(text)).toThrow(DocumentError);
    }
  });

  it.each([
    ['another version', (draft: Record<string, unknown>) => (draft.version = 2)],
    ['an unknown key', (draft: Record<string, unknown>) => (draft.extra = 1)],
    ['an unknown action', (draft: Record<string, unknown>) => (draft.action = 'push')],
    [
      'a directory of another slug',
      (draft: Record<string, unknown>) => (draft.directory = 'specs/active/other'),
    ],
    [
      'a path outside the directory',
      (draft: Record<string, unknown>) =>
        ((draft.paths as { path: string }[])[0]!.path = 'elsewhere/a.md'),
    ],
    [
      'a traversal path',
      (draft: Record<string, unknown>) =>
        ((draft.paths as { path: string }[])[0]!.path = DIR + '../x.md'),
    ],
    [
      'a duplicate path',
      (draft: Record<string, unknown>) => {
        const paths = draft.paths as { path: string }[];
        paths[1]!.path = paths[0]!.path;
      },
    ],
    [
      'a manifest that is not last',
      (draft: Record<string, unknown>) => (draft.paths as unknown[]).reverse(),
    ],
    [
      'a write without a payload source',
      (draft: Record<string, unknown>) =>
        ((draft.paths as { source: unknown }[])[0]!.source = { kind: 'none' }),
    ],
    [
      'a move from a path the plan does not remove',
      (draft: Record<string, unknown>) =>
        ((draft.paths as { source: { path: string } }[])[0]!.source.path = DIR + 'unknown.md'),
    ],
    [
      'a bad hash',
      (draft: Record<string, unknown>) =>
        ((draft.paths as { post: { sha256: string } }[])[0]!.post.sha256 = 'zz'),
    ],
    [
      'a registry without a manifest path',
      (draft: Record<string, unknown>) => (draft.paths as unknown[]).pop(),
    ],
    [
      'a reordered key',
      (draft: Record<string, unknown>) => {
        const { action, ...rest } = draft;
        Object.keys(draft).forEach((key) => delete draft[key]);
        Object.assign(draft, rest, { action });
      },
    ],
  ])('rejects %s', (_name, change) => {
    expect(() => decodePlan(mutate(renamePlan(), change))).toThrow(DocumentError);
  });

  it('round-trips a workflow plan and keeps it to the execution state it commits', () => {
    const state = { sha256: 'a'.repeat(64), bytes: 3 };
    const workflow: DocumentChangePlan = {
      version: 1,
      action: 'workflow',
      specId: TEST_SPEC_ID,
      slug: TEST_SLUG,
      directory: `specs/active/${TEST_SLUG}`,
      paths: [
        {
          path: `${DIR}tasks/api/task.yaml`,
          role: 'document',
          pre: null,
          post: state,
          source: { kind: 'written' },
        },
        {
          path: `${DIR}.execution/tasks/old.yaml`,
          role: 'document',
          pre: state,
          post: null,
          source: { kind: 'none' },
        },
      ],
      documents: [],
      removedDocumentIds: [],
      folders: [],
      allocatedIds: [],
      templates: [],
      summary: 'create task api',
    };
    expect(decodePlan(encodePlan(workflow).text)).toEqual(workflow);

    const refused: readonly ((draft: Record<string, unknown>) => void)[] = [
      (draft) => delete draft.summary,
      (draft) => (draft.summary = 'two\nlines'),
      (draft) => ((draft.paths as Record<string, unknown>[])[0]!.path = `${DIR}overview.md`),
      (draft) => ((draft.paths as Record<string, unknown>[])[0]!.source = { kind: 'payload' }),
      (draft) => (draft.taskId = 'api'),
    ];
    for (const change of refused) {
      expect(() => decodePlan(mutate(workflow, change))).toThrow(DocumentError);
    }

    // A document plan neither carries a summary nor commits a path written by another writer.
    expect(() => decodePlan(mutate(renamePlan(), (draft) => (draft.summary = 'x')))).toThrow(
      DocumentError,
    );
  });

  it('refuses to encode a plan with more paths than a batch holds', () => {
    const plan = renamePlan();
    const many = Array.from({ length: 201 }, (_, i) => ({
      ...plan.paths[0]!,
      path: `${DIR}f${i}.md`,
      source: { kind: 'payload' as const },
    }));
    expect(() => encodePlan({ ...plan, paths: many })).toThrow(DocumentError);
  });
});
