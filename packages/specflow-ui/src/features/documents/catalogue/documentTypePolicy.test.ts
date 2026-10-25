import type { ArchetypeCatalogue } from '@nevo/specflow-contracts/documents';
import { describe, expect, it } from 'vitest';
import { documentTreeFixture } from '../../../../test-support/documents/fixtures';
import {
  closeRefusingIssues,
  defaultFileName,
  documentGuidance,
  documentReadOnlyReason,
  documentTrailingLabel,
  initialTypeChoice,
  menuReasonNote,
  nameSaysType,
  specificationReadOnlyReason,
  typeChoices,
  typeTitle,
  unmetRequirements,
} from './documentTypePolicy';

const type = (id: string, title: string, defaultFilename?: string) => ({
  id,
  title,
  description: `${title} description`,
  useWhen: `${title} use when`,
  instructions: `${title} instructions`,
  ...(defaultFilename ? { defaultFilename } : {}),
});

const catalogue: ArchetypeCatalogue = {
  revision: 'r1',
  documentTypes: [
    type('overview', 'Overview', 'overview.md'),
    type('ux', 'UX', 'ux.md'),
    type('decisions', 'Decisions', 'decisions.md'),
    type('note', 'Note'),
    type('backend', 'Backend', 'backend-design.md'),
  ],
  archetypes: [
    {
      id: 'team',
      version: 1,
      title: 'Team feature',
      description: 'd',
      useWhen: 'u',
      requirements: [
        { documentType: 'overview', minCount: 1 },
        { documentType: 'decisions', minCount: 1 },
      ],
      documents: [
        {
          id: 'overview',
          type: 'overview',
          title: 'Overview',
          filename: 'overview.md',
          include: 'always',
          content: '',
        },
        {
          id: 'decisions',
          type: 'decisions',
          title: 'Decisions',
          filename: 'decision-log.md',
          include: 'optional',
          content: '',
          instructions: 'Template instructions',
        },
        { id: 'ux', type: 'ux', title: 'UX', filename: 'ux.md', include: 'optional', content: '' },
      ],
    },
  ],
};

const tree = documentTreeFixture({
  archetype: { id: 'team', version: 1, title: 'Team feature' },
  documents: [
    { id: 'overview', path: 'overview.md', type: 'overview', protected: true },
    { id: 'ux', path: 'ux.md', type: 'ux' },
    { id: 'ux-2', path: 'architecture/login-flow.md', type: 'ux' },
    { id: 'u-notes-x-md', path: 'notes/x.md', classification: 'unclassified', type: undefined },
  ],
  completeness: {
    complete: false,
    requirements: [
      { documentType: 'overview', minCount: 1, count: 1, satisfied: true },
      { documentType: 'decisions', minCount: 1, count: 0, satisfied: false },
    ],
  },
});

describe('type labels', () => {
  it('falls back to the type id without a catalogue', () => {
    expect(typeTitle(undefined, 'ux')).toBe('ux');
    expect(typeTitle(catalogue, 'ux')).toBe('UX');
  });

  it('says the type only when the file name does not', () => {
    expect(nameSaysType('ux.md', 'ux', catalogue)).toBe(true);
    expect(nameSaysType('docs/UX.md', 'ux', catalogue)).toBe(true);
    // The stem of the type's default name says it too.
    expect(nameSaysType('backend-design.md', 'backend', catalogue)).toBe(true);
    expect(nameSaysType('login-flow.md', 'ux', catalogue)).toBe(false);
    expect(documentTrailingLabel(tree.documents[1]!, catalogue)).toBeUndefined();
    expect(documentTrailingLabel(tree.documents[2]!, catalogue)).toEqual({
      kind: 'type',
      text: 'UX',
    });
    // An unclassified file has no row label (owner: the 'No type' text was noise).
    expect(documentTrailingLabel(tree.documents[3]!, catalogue)).toBeUndefined();
  });
});

describe('what needs the reader', () => {
  it('lists only the unmet requirements and only the Close-refusing issues', () => {
    expect(unmetRequirements(tree).map((r) => r.documentType)).toEqual(['decisions']);
    const issues = closeRefusingIssues({
      issues: [
        { code: 'dangling', path: 'a.md' },
        { code: 'skipped-entry' },
        { code: 'path-case-collision', path: 'notes/A.md' },
        { code: 'archive-limit' },
        { code: 'requirement-unmet', documentType: 'decisions' },
      ],
    });
    expect(issues.map((issue) => issue.code)).toEqual(['path-case-collision', 'archive-limit']);
  });
});

describe('type chooser', () => {
  const choices = typeChoices(catalogue, tree);

  it('groups the archetype suggestions and the other types, never the overview', () => {
    expect(choices.suggested.map((choice) => choice.type.id)).toEqual(['decisions', 'ux']);
    expect(choices.other.map((choice) => choice.type.id)).toEqual(['note', 'backend']);
  });

  it('states the expected count while unmet, else how many are present', () => {
    expect(choices.suggested[0]!.fact).toEqual({ kind: 'expected', count: 0, min: 1 });
    expect(choices.suggested[1]!.fact).toEqual({ kind: 'present', count: 2 });
    expect(choices.other[0]!.fact).toBeUndefined();
  });

  it('selects the asked type, else the first absent suggestion, else the first suggestion', () => {
    expect(initialTypeChoice(choices, 'note')).toBe('note');
    expect(initialTypeChoice(choices, 'unknown')).toBe('decisions');
    const allPresent = typeChoices(catalogue, {
      ...tree,
      completeness: { complete: true, requirements: [] },
      documents: [...tree.documents, { ...tree.documents[1]!, id: 'd', type: 'decisions' }],
    });
    expect(initialTypeChoice(allPresent)).toBe('decisions');
    expect(initialTypeChoice({ suggested: [], other: choices.other })).toBe('note');
  });

  it('pre-fills the template name, else the type default, else <type>.md', () => {
    expect(defaultFileName(choices.suggested[0])).toBe('decision-log.md');
    expect(defaultFileName(choices.other[1])).toBe('backend-design.md');
    expect(defaultFileName(choices.other[0])).toBe('note.md');
    expect(defaultFileName(undefined)).toBe('untitled.md');
  });
});

describe('read-only reason', () => {
  const unavailable = (reason: 'branch-protected' | 'archived' | 'not-implemented') => ({
    available: false,
    reason,
  });

  it('is Specification-wide only when every way to add files is unavailable', () => {
    expect(specificationReadOnlyReason(tree)).toBeUndefined();
    const locked = documentTreeFixture({
      capabilities: {
        ...tree.capabilities,
        createFile: unavailable('branch-protected'),
        createFolder: unavailable('archived'),
        import: unavailable('branch-protected'),
      },
    });
    // Archived comes first in the design's order.
    expect(specificationReadOnlyReason(locked)).toBe('archived');
  });

  it('adds not-editable for a file that can only be viewed, after the Specification reasons', () => {
    expect(documentReadOnlyReason(tree, { editable: true })).toBeUndefined();
    expect(documentReadOnlyReason(tree, { editable: false })).toBe('not-editable');
    const protectedBranch = documentTreeFixture({
      capabilities: { ...tree.capabilities, createFile: unavailable('branch-protected') },
    });
    expect(documentReadOnlyReason(protectedBranch, { editable: false })).toBe('branch-protected');
  });

  it('never makes an open document read-only while another write commits (busy)', () => {
    const busy = { available: false, reason: 'busy' } as const;
    const committing = documentTreeFixture({
      capabilities: {
        ...tree.capabilities,
        createFile: busy,
        createFolder: busy,
        import: busy,
        classify: busy,
      },
    });
    expect(documentReadOnlyReason(committing, { editable: true })).toBeUndefined();
    expect(specificationReadOnlyReason(committing)).toBeUndefined();
  });

  it('notes a whole-sentence reason alone and wraps a fragment', () => {
    expect(menuReasonNote('protected')).toEqual({ key: 'documents.reason.protected' });
    expect(menuReasonNote('branch-protected')).toEqual({
      key: 'documents.reason.note',
      values: { reason: { key: 'documents.reason.branchProtected' } },
    });
  });
});

describe('writing guidance', () => {
  it('is the type text plus the template instructions of the archetype, for registered documents only', () => {
    expect(
      documentGuidance(catalogue, tree, { classification: 'registered', type: 'decisions' }),
    ).toEqual({
      title: 'Decisions',
      description: 'Decisions description',
      useWhen: 'Decisions use when',
      instructions: ['Decisions instructions', 'Template instructions'],
    });
    expect(documentGuidance(catalogue, tree, { type: 'ux' })?.instructions).toEqual([
      'UX instructions',
    ]);
    expect(
      documentGuidance(catalogue, tree, { classification: 'unclassified', type: undefined }),
    ).toBeUndefined();
    expect(documentGuidance(catalogue, tree, { type: 'unknown' })).toBeUndefined();
    expect(documentGuidance(undefined, tree, { type: 'ux' })).toBeUndefined();
  });
});
