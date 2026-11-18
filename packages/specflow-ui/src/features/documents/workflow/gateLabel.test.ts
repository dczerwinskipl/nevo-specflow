import { describe, expect, it } from 'vitest';
import { createSpecFlowI18n } from '../../../i18n';
import { translateMessage } from '../../../i18n/message';
import { gateLine } from './gateLabel';

const i18n = createSpecFlowI18n('en');
const text = (value: Parameters<typeof translateMessage>[1]) =>
  translateMessage(i18n.t, value, 'en');

/** A gate without a declared label: the Engine's derived `label` is never read. */
const derived = (documentType: string, requiredSections: string[]) => ({
  label: 'derived by the Engine, not shown',
  labelDeclared: false,
  documentType,
  requiredSections,
});
const declared = (label: string, requiredSections: string[]) => ({
  label,
  labelDeclared: true,
  documentType: 'task',
  requiredSections,
});
const unmet = (missingSections: string[]) =>
  ({ status: 'unsatisfied', reason: 'sections-missing', missingSections }) as const;

describe('gateLine', () => {
  it('says a derived gate with the file name, never the type id, and "not yet" once', () => {
    const line = gateLine(
      { ...derived('behaviour', ['Acceptance']), ...unmet(['Acceptance']) },
      'behaviour.md',
    );

    expect(text(line.label)).toBe('behaviour.md has an Acceptance section');
    expect(line.detail && text(line.detail)).toBe('not yet');
    expect(line.namesDocument).toBe(true);
  });

  it('falls back to the document type and names only the sections still missing', () => {
    const line = gateLine({
      ...derived('behaviour', ['Acceptance', 'Risks']),
      ...unmet(['Risks']),
    });

    expect(text(line.label)).toBe('A Behaviour document has the Acceptance and Risks sections');
    expect(line.detail && text(line.detail)).toBe('not yet · Risks section missing');
  });

  it('keeps a declared label and does not repeat the sections it names', () => {
    expect(
      text(
        gateLine({
          ...declared('task.md has a Verification section', ['Verification']),
          ...unmet(['Verification']),
        }).detail!,
      ),
    ).toBe('not yet');
    expect(
      text(
        gateLine({
          ...declared('Review done', ['Review notes', 'Risks']),
          ...unmet(['Review notes', 'Risks']),
        }).detail!,
      ),
    ).toBe('not yet · Review notes and Risks sections missing');
  });

  it('says "not yet" for a document not registered yet, and why for one that cannot be met', () => {
    const gate = derived('findings', []);
    expect(text(gateLine({ ...gate, status: 'unsatisfied', reason: 'no-document' }).label)).toBe(
      'A Findings document',
    );
    expect(text(gateLine({ ...gate, status: 'unsatisfied', reason: 'no-document' }).detail!)).toBe(
      'not yet',
    );
    expect(text(gateLine({ ...gate, status: 'unsatisfied', reason: 'file-missing' }).detail!)).toBe(
      'its file is missing',
    );
  });
});
