import { describe, expect, it } from 'vitest';

import type { DocumentGate, WorkStep } from '../definitions/model';
import { evaluateDocumentGate, exitGatesFor, gateScope, markdownHeadings } from './evaluate';

const gate = (overrides: Partial<DocumentGate> = {}): DocumentGate => ({
  id: 'findings',
  type: 'document',
  documentType: 'research',
  scope: 'subject',
  requiredSections: ['Findings', 'Open questions'],
  ...overrides,
});

const scope = { kind: 'task', specId: 's', taskId: 't' } as const;

describe('markdownHeadings', () => {
  it('reads ATX headings of any level, trimmed and lowercased, outside fenced code', () => {
    const headings = markdownHeadings(
      [
        '# Research  ',
        '##   Open questions ##',
        '```md',
        '## Findings',
        '```',
        '#NoSpace',
        '    ## indented code',
        '~~~',
        '# fenced',
        '~~~',
        '###### *Risks*',
        'Setext',
        '======',
        '### Findings',
      ].join('\r\n'),
    );

    expect([...headings]).toEqual(['research', 'open questions', '*risks*', 'findings']);
  });

  it('keeps a fence open past a fence line with an info string or another character', () => {
    const headings = markdownHeadings(
      ['````', '```js', '~~~~', '## Inside', '````', '## After'].join('\n'),
    );

    expect([...headings]).toEqual(['after']);
  });

  it('ignores front matter and HTML comments', () => {
    const headings = markdownHeadings(
      [
        '---',
        '# not a heading: YAML',
        '---',
        '<!--',
        '## Commented out',
        '-->',
        '<!-- one line --> ',
        '## Kept <!-- inline -->',
      ].join('\n'),
    );

    expect([...headings]).toEqual(['kept <!-- inline -->']);
    // Without a closing line it is not front matter.
    expect([...markdownHeadings('---\n# Title')]).toEqual(['title']);
  });
});

describe('evaluateDocumentGate', () => {
  it('is satisfied by the first document with a file and every section', () => {
    expect(
      evaluateDocumentGate(gate(), scope, [
        { id: 'a', present: true, text: '## Findings\n' },
        { id: 'b', present: true, text: '## Findings\n## open questions\n' },
        { id: 'c', present: true, text: '## Findings\n## Open questions\n' },
      ]),
    ).toEqual({
      id: 'findings',
      type: 'document',
      label: 'A "research" document with Findings, Open questions',
      documentType: 'research',
      scope,
      status: 'satisfied',
      documentId: 'b',
    });
  });

  it.each([
    ['no-document', [], {}],
    ['file-missing', [{ id: 'a', present: false }], {}],
    [
      'sections-missing',
      [
        { id: 'a', present: true },
        { id: 'b', present: true, text: '# Open questions' },
        { id: 'c', present: false },
      ],
      { documentId: 'b', missingSections: ['Findings'] },
    ],
    [
      'unreadable',
      [
        { id: 'a', present: false },
        { id: 'b', present: true, unreadable: true, text: '## Findings\n## Open questions' },
      ],
      { documentId: 'b' },
    ],
  ] as const)('reports %s', (reason, documents, details) => {
    expect(evaluateDocumentGate(gate(), scope, documents)).toMatchObject({
      status: 'unsatisfied',
      reason,
      ...details,
    });
  });

  it('needs only a file without required sections, and keeps a declared label', () => {
    expect(
      evaluateDocumentGate(gate({ requiredSections: [], label: 'Findings written' }), scope, [
        { id: 'pdf', present: true },
      ]),
    ).toMatchObject({ status: 'satisfied', label: 'Findings written', documentId: 'pdf' });
  });
});

describe('gate scope and applicability', () => {
  it('looks in the Task or the Specification', () => {
    const subject = { kind: 'task', specId: 's', taskId: 't' } as const;
    expect(gateScope(subject, gate())).toEqual(scope);
    expect(gateScope(subject, gate({ scope: 'specification' }))).toEqual({
      kind: 'specification',
      specId: 's',
    });
    expect(gateScope({ kind: 'specification', specId: 's' }, gate())).toEqual({
      kind: 'specification',
      specId: 's',
    });
  });

  it('applies an exit gate with `when` only to the transitions of those results', () => {
    const step = {
      annotations: {
        interaction: 'autonomous',
        exitGates: [
          { ...gate(), id: 'always' },
          { ...gate(), id: 'on-pass', when: ['pass'] },
        ],
      },
    } as unknown as WorkStep;

    expect(exitGatesFor(step, 'pass').map((entry) => entry.id)).toEqual(['always', 'on-pass']);
    expect(exitGatesFor(step, 'fail').map((entry) => entry.id)).toEqual(['always']);
    expect(exitGatesFor(step, undefined).map((entry) => entry.id)).toEqual(['always']);
  });
});
