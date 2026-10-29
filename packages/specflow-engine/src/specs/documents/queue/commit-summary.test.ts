import { describe, expect, it } from 'vitest';

import { deriveUnclassifiedDocumentId } from '../../document-rules';
import { buildSnapshot, TEST_SLUG } from '../changes/test-support';
import {
  planDocumentChange,
  type DocumentChangePlan,
  type DocumentChangeRequest,
  type PlanningSnapshot,
} from '../changes/plan';
import {
  DOCUMENT_COMMIT_BODY_LINES_MAX,
  DOCUMENT_COMMIT_SUBJECT_MAX,
  documentCommitMessage,
  fitParts,
  type SummarizedMember,
} from './commit-summary';

const DIR = `specs/active/${TEST_SLUG}/`;

const snapshot = buildSnapshot({
  documents: [
    { id: 'notes', path: 'notes.md', type: 'notes' },
    { id: 'api', path: 'design/api.md', type: 'notes' },
  ],
  files: [
    { path: 'overview.md', content: '# Overview\n' },
    { path: 'notes.md', content: 'notes\n' },
    { path: 'design/api.md', content: 'api\n' },
    { path: 'loose.md', content: 'loose\n' },
  ],
});

const revision = (path: string, from: PlanningSnapshot = snapshot): string =>
  from.files.find((file) => file.path === path)!.revision;

function planOf(
  request: DocumentChangeRequest,
  from: PlanningSnapshot = snapshot,
): DocumentChangePlan {
  return planDocumentChange(from, request, { folderRevision: (folder) => 'rev:' + folder }).plan;
}

/** The message of one batch whose commit holds every planned path. */
function messageOf(...plans: DocumentChangePlan[]) {
  const members: SummarizedMember[] = plans.map((plan) => ({ action: plan.action, plan }));
  const effective = [...new Set(plans.flatMap((plan) => plan.paths.map((path) => path.path)))];
  return documentCommitMessage(TEST_SLUG, members, effective);
}

const save = (documentId: string, path: string, content = 'changed\n') =>
  planOf({ action: 'save', documentId, content, expectedRevision: revision(path) });

describe('the message of a document commit', () => {
  it('names the one saved document', () => {
    expect(messageOf(save('notes', 'notes.md'))).toEqual({
      subject: `spec(documents): update notes.md in ${TEST_SLUG}`,
      body: 'update notes.md',
    });
  });

  it('counts several saved documents, also across coalesced operations, and lists each once', () => {
    const message = messageOf(
      save('notes', 'notes.md'),
      save('api', 'design/api.md'),
      save('notes', 'notes.md', 'again\n'),
    );
    expect(message.subject).toBe(`spec(documents): update 2 documents in ${TEST_SLUG}`);
    expect(message.body).toBe(
      'update notes.md\nupdate design/api.md\n\n3 document operations in one commit',
    );
  });

  it('words a create, a new folder, a rename, a move, a delete and a classify', () => {
    expect(
      messageOf(
        planOf({ action: 'create', documents: [{ path: 'new.md', content: 'n' }], folders: [] }),
      ).subject,
    ).toBe(`spec(documents): add new.md to ${TEST_SLUG}`);
    expect(
      messageOf(
        planOf({
          action: 'create',
          documents: [
            { path: 'a/one.md', content: '1' },
            { path: 'a/two.md', content: '2' },
          ],
          folders: ['a'],
        }),
      ).subject,
    ).toBe(`spec(documents): add 2 documents to ${TEST_SLUG}`);
    expect(messageOf(planOf({ action: 'folder', path: 'drafts' })).subject).toBe(
      `spec(documents): add folder drafts to ${TEST_SLUG}`,
    );
    const renamed = messageOf(
      planOf({
        action: 'rename',
        target: { kind: 'document', documentId: 'notes' },
        name: 'ideas.md',
        expectedRevision: revision('notes.md'),
      }),
    );
    expect(renamed).toEqual({
      subject: `spec(documents): rename notes.md to ideas.md in ${TEST_SLUG}`,
      body: 'rename notes.md -> ideas.md',
    });
    expect(
      messageOf(
        planOf({
          action: 'move',
          target: { kind: 'document', documentId: 'notes' },
          targetFolder: 'design',
          expectedRevision: revision('notes.md'),
        }),
      ).subject,
    ).toBe(`spec(documents): move notes.md to design/notes.md in ${TEST_SLUG}`);
    expect(
      messageOf(
        planOf({
          action: 'delete',
          target: { kind: 'document', documentId: 'notes' },
          expectedRevision: revision('notes.md'),
        }),
      ).subject,
    ).toBe(`spec(documents): delete notes.md from ${TEST_SLUG}`);
    expect(
      messageOf(
        planOf({
          action: 'classify',
          documentId: deriveUnclassifiedDocumentId('loose.md'),
          type: 'notes',
          expectedRevision: revision('loose.md'),
        }),
      ),
    ).toEqual({
      subject: `spec(documents): classify loose.md as notes in ${TEST_SLUG}`,
      body: 'classify loose.md as notes',
    });
  });

  it('names a renamed or moved folder, not its files', () => {
    const renamed = messageOf(
      planOf({
        action: 'rename',
        target: { kind: 'folder', path: 'design' },
        name: 'guides',
        expectedRevision: 'rev:design',
      }),
    );
    expect(renamed).toEqual({
      subject: `spec(documents): rename folder design to guides in ${TEST_SLUG}`,
      body: 'rename folder design -> guides',
    });
  });

  it('says change when the operations did different things', () => {
    const message = messageOf(
      save('notes', 'notes.md'),
      planOf({
        action: 'delete',
        target: { kind: 'document', documentId: 'api' },
        expectedRevision: revision('design/api.md'),
      }),
    );
    expect(message.subject).toBe(`spec(documents): change 2 documents in ${TEST_SLUG}`);
    expect(message.body).toBe(
      'update notes.md\ndelete design/api.md\n\n2 document operations in one commit',
    );
  });

  it('leaves out a change the commit does not hold, unless nothing else is left', () => {
    const notes = save('notes', 'notes.md');
    const api = save('api', 'design/api.md');
    const members = [notes, api].map((plan) => ({ action: plan.action, plan }));
    expect(documentCommitMessage(TEST_SLUG, members, [DIR + 'design/api.md']).subject).toBe(
      `spec(documents): update design/api.md in ${TEST_SLUG}`,
    );
    expect(documentCommitMessage(TEST_SLUG, members, [DIR + 'other.md']).subject).toBe(
      `spec(documents): update 2 documents in ${TEST_SLUG}`,
    );
  });

  it('falls back to the action and the committed paths when a plan is unknown', () => {
    expect(documentCommitMessage(TEST_SLUG, [{ action: 'save' }], [DIR + 'notes.md'])).toEqual({
      subject: `spec(documents): update notes.md in ${TEST_SLUG}`,
      body: 'notes.md',
    });
    expect(
      documentCommitMessage(
        TEST_SLUG,
        [{ action: 'save' }, { action: 'rename' }],
        [DIR + 'a.md', DIR + 'b.md', DIR + 'specification.yaml'],
      ).subject,
    ).toBe(`spec(documents): change 2 documents in ${TEST_SLUG}`);
  });

  it('keeps the subject within 72 characters, shortening the longest name with an ellipsis', () => {
    const long = 'a-very-long-document-name-that-goes-on-and-on-and-on.md';
    const withLong = buildSnapshot({ files: [{ path: long, content: 'x' }] });
    const plan = planOf(
      {
        action: 'rename',
        target: { kind: 'document', documentId: deriveUnclassifiedDocumentId(long) },
        name: 'another-equally-long-name-for-the-same-document.md',
        expectedRevision: revision(long, withLong),
      },
      withLong,
    );
    const { subject } = messageOf(plan);
    expect(Array.from(subject).length).toBeLessThanOrEqual(DOCUMENT_COMMIT_SUBJECT_MAX);
    expect(subject.startsWith('spec(documents): rename a-very-long')).toBe(true);
    expect(subject).toContain('…');
    // Deterministic: the same input gives the same subject.
    expect(messageOf(plan).subject).toBe(subject);
  });

  it('never cuts inside a character of a non-ASCII name', () => {
    const name = 'zażółć-gęślą-jaźń-🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂-łódź-źdźbło-pięćdziesiąt.md';
    const withName = buildSnapshot({ files: [{ path: name, content: 'x' }] });
    const { subject } = messageOf(
      planOf(
        {
          action: 'save',
          documentId: deriveUnclassifiedDocumentId(name),
          content: 'y',
          expectedRevision: revision(name, withName),
        },
        withName,
      ),
    );
    expect(Array.from(subject).length).toBeLessThanOrEqual(DOCUMENT_COMMIT_SUBJECT_MAX);
    // Re-encoding round-trips: no lone surrogate half was left by a cut.
    expect(Buffer.from(subject, 'utf8').toString('utf8')).toBe(subject);
    expect(subject).not.toMatch(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u,
    );
    expect(subject.startsWith('spec(documents): update zażółć')).toBe(true);
  });

  it('bounds the body and names what it left out', () => {
    const many = buildSnapshot({
      files: [
        { path: 'overview.md', content: 'o' },
        ...Array.from({ length: 30 }, (_, index) => ({
          path: `bulk/n${String(index).padStart(2, '0')}.md`,
          content: 'x',
        })),
      ],
    });
    const { subject, body } = messageOf(
      planOf(
        {
          action: 'delete',
          target: { kind: 'folder', path: 'bulk' },
          expectedRevision: 'rev:bulk',
        },
        many,
      ),
    );
    // A folder delete names the folder; its files are listed in the body.
    expect(subject).toBe(`spec(documents): delete folder bulk from ${TEST_SLUG}`);
    const lines = body.split(String.fromCharCode(10));
    expect(lines).toHaveLength(DOCUMENT_COMMIT_BODY_LINES_MAX + 1);
    expect(lines[0]).toBe('delete folder bulk');
    expect(lines[1]).toBe('delete bulk/n00.md');
    expect(lines.at(-1)).toBe('… and 11 more');
  });

  it('names an empty folder it deletes (only the registry changes)', () => {
    const withEmpty = buildSnapshot({ folders: ['drafts/later'] });
    const plan = planOf(
      {
        action: 'delete',
        target: { kind: 'folder', path: 'drafts/later' },
        expectedRevision: 'rev:drafts/later',
      },
      withEmpty,
    );
    expect(plan.removedFolder).toBe('drafts/later');
    expect(messageOf(plan)).toEqual({
      subject: `spec(documents): delete folder drafts/later from ${TEST_SLUG}`,
      body: 'delete folder drafts/later',
    });
    // A long folder name is shortened within the subject bound.
    const long = 'a-very-long-folder-name-that-would-not-fit-into-one-commit-subject-line';
    const withLong = buildSnapshot({ folders: [long] });
    const { subject } = messageOf(
      planOf(
        {
          action: 'delete',
          target: { kind: 'folder', path: long },
          expectedRevision: 'rev:' + long,
        },
        withLong,
      ),
    );
    expect(Array.from(subject).length).toBeLessThanOrEqual(DOCUMENT_COMMIT_SUBJECT_MAX);
    expect(subject.startsWith('spec(documents): delete folder a-very-long')).toBe(true);
  });
});

describe('fitting a subject', () => {
  it('shortens the longest name first and keeps the fixed words', () => {
    expect(fitParts(['x ', { name: 'abcdefgh' }, ' y ', { name: 'abc' }], 12)).toBe('x abc… y abc');
    // Equal lengths: the first name is cut first.
    expect(fitParts([{ name: 'abcd' }, '-', { name: 'efgh' }], 8)).toBe('ab…-efgh');
    expect(fitParts(['fixed words only'], 5)).toBe('fixed words only');
    expect(fitParts([{ name: 'ab' }, { name: 'cd' }], 1)).toBe('abcd');
  });
});
