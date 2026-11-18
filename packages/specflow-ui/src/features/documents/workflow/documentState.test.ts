import type { DocumentRelation } from '@nevo/specflow-contracts/workflow';
import { describe, expect, it } from 'vitest';
import { createSpecFlowI18n } from '../../../i18n/i18n';
import { translateMessage, type Message } from '../../../i18n/message';
import { documentRelations, documentStateLabel, sharedContentLabel } from './documentState';

const en = createSpecFlowI18n('en').t;
const renderMessage = (value: Message | string) => translateMessage(en, value, 'en');

const specScope = { kind: 'specification', specId: 'sso' } as const;

const relation = (
  kind: DocumentRelation['relation'],
  overrides: Partial<DocumentRelation> = {},
): DocumentRelation => ({
  scope: specScope,
  documentId: 'behaviour',
  relation: kind,
  blocksNow: kind === 'needed-to-finish',
  step: { id: 'write', title: 'Write the specification', active: kind !== 'needed-to-start' },
  gate: {
    id: 'acceptance',
    label: 'behaviour.md has an Acceptance section',
    labelDeclared: true,
    documentType: 'behaviour',
    requiredSections: ['Acceptance'],
  },
  ...overrides,
});

/** The label as the row shows it: full text, short text, tone and tooltip lines. */
const shown = (...args: Parameters<typeof documentStateLabel>) => {
  const label = documentStateLabel(...args);

  return (
    label && {
      text: renderMessage(label.text),
      short: renderMessage(label.short),
      tone: label.tone,
      details: label.details.map(renderMessage),
      contentOnly: label.contentOnly,
    }
  );
};

const onScreen = { stepOnScreen: true };
const elsewhere = { stepOnScreen: false };

describe('documentStateLabel', () => {
  it('says nothing for an authored or unknown document no gate names', () => {
    expect(shown('authored', undefined, onScreen)).toBeUndefined();
    expect(shown(undefined, undefined, onScreen)).toBeUndefined();
  });

  it('names the content state alone, muted, when no relation applies (also after Close)', () => {
    expect(shown('baseline', undefined, onScreen)).toEqual({
      text: 'Initial content only',
      short: 'Initial content',
      tone: 'muted',
      details: [],
      contentOnly: true,
    });
  });

  it.each([
    ['needed-to-finish', true, 'Needed to finish this step', 'Needed to finish', 'attention'],
    ['needed-to-finish', false, 'Needed to finish this step', 'Needed to finish', 'secondary'],
    ['used', false, 'Used in this step', 'Used in this step', 'secondary'],
  ] as const)(
    'names an active-step %s relation (blocks now: %s) as "this step" where the step is on screen',
    (kind, blocksNow, text, short, tone) => {
      expect(shown('authored', relation(kind, { blocksNow }), onScreen)).toMatchObject({
        text,
        short,
        tone,
        contentOnly: false,
      });
      expect(shown(undefined, relation(kind, { blocksNow }), onScreen)?.text).toBe(text);
    },
  );

  it.each([
    ['needed-to-finish', 'Needed to finish Write the specification'],
    ['used', 'Used in Write the specification'],
  ] as const)('names the step of a %s relation where it is not on screen', (kind, text) => {
    expect(shown('authored', relation(kind), elsewhere)?.text).toBe(text);
  });

  it('names the next step of a needed-to-start relation, attention only while it refuses a start now', () => {
    const later = relation('needed-to-start', {
      step: { id: 'design', title: 'Design the solution', active: false },
    });
    expect(shown('authored', later, onScreen)).toMatchObject({
      text: 'Needed to start Design the solution',
      short: 'Needed to start',
      tone: 'secondary',
    });
    expect(shown('authored', { ...later, blocksNow: true }, elsewhere)?.tone).toBe('attention');
    // Even before a start (the next step reported as the one to start) the step is named.
    const startNow = { ...later, blocksNow: true, step: { ...later.step, active: true } };
    expect(shown('baseline', startNow, onScreen)?.text).toBe(
      'Initial content only · needed to start Design the solution',
    );
  });

  it.each([
    ['needed-to-finish', onScreen, 'Initial content only · needed to finish this step'],
    [
      'needed-to-finish',
      elsewhere,
      'Initial content only · needed to finish Write the specification',
    ],
    ['used', onScreen, 'Initial content only · used in this step'],
  ] as const)(
    'puts both facts together when a baseline document has a %s relation',
    (kind, options, text) => {
      const label = shown('baseline', relation(kind), options);
      expect(label?.text).toBe(text);
      expect(label?.short).toBe(
        kind === 'used'
          ? 'Initial content · used in this step'
          : 'Initial content · needed to finish',
      );
      // The relation decides the tone; the content state never adds attention.
      expect(label?.tone).toBe(kind === 'used' ? 'secondary' : 'attention');
    },
  );

  it('lists the full label, the gate and its missing sections in the tooltip', () => {
    const missing = relation('needed-to-finish', {
      gate: {
        id: 'g',
        label: 'behaviour.md has an Acceptance section',
        labelDeclared: true,
        documentType: 'behaviour',
        requiredSections: ['Acceptance'],
        missingSections: ['Acceptance'],
      },
    });
    expect(shown('authored', missing, onScreen)?.details).toEqual([
      'Needed to finish this step',
      'behaviour.md has an Acceptance section',
      'Needs the Acceptance section',
    ]);
  });
});

describe('documentRelations', () => {
  it('keeps the relations of one registry, by document id', () => {
    const taskScope = { kind: 'task', specId: 'sso', taskId: 'oidc' } as const;
    const relations = [
      relation('used', { documentId: 'overview' }),
      relation('needed-to-finish', { documentId: 'task', scope: taskScope }),
      relation('used', { documentId: 'other', scope: { ...taskScope, taskId: 'other' } }),
    ];

    expect([...documentRelations(relations, specScope).keys()]).toEqual(['overview']);
    expect([...documentRelations(relations, taskScope).keys()]).toEqual(['task']);
    expect(documentRelations(undefined, specScope).size).toBe(0);
  });
});

describe('sharedContentLabel', () => {
  const baseline = documentStateLabel('baseline', undefined, onScreen);
  const related = documentStateLabel('baseline', relation('used'), onScreen);

  it('moves one content-only label shared by every row to the header', () => {
    expect(sharedContentLabel([baseline, baseline, baseline])).toBe(baseline);
  });

  it('keeps the labels on the rows when one differs, names a relation, or there is one row', () => {
    expect(sharedContentLabel([baseline, undefined])).toBeUndefined();
    expect(sharedContentLabel([baseline, related])).toBeUndefined();
    expect(sharedContentLabel([baseline])).toBeUndefined();
  });
});
