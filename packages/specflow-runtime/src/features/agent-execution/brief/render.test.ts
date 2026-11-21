import { describe, expect, it } from 'vitest';

import { deriveAgentScope, type StepContext } from '@nevo/specflow-engine';

import { writeOperations } from './operations';
import { renderAgentBrief } from './render';

const base = {
  workflow: { id: 'w', version: 1 },
  attempt: 1,
  finish: { transitions: [] },
  step: { id: 'draft', title: 'Draft', kind: 'work', purpose: 'Write it.' },
} as unknown as Omit<StepContext, 'subject'>;

const agent = {
  documents: [
    {
      id: 'd1',
      type: 'spec',
      title: 'Spec',
      path: 'docs/spec.md',
      revision: 'r1',
      templateOnly: false,
    },
  ],
  documentTypes: [{ id: 'spec', title: 'Spec', useWhen: 'always', instructions: '' }],
};

const scope = deriveAgentScope({ kind: 'ad-hoc', specId: 'S1' });

describe('agent brief', () => {
  it('renders a Specification subject', () => {
    const context = { ...base, subject: { specId: 'S1' }, agent } as unknown as StepContext;
    expect(renderAgentBrief({ context, scope })).toMatchInlineSnapshot(`
      "# Brief: Draft
      Subject: Specification S1. Attempt 1.

      Purpose: Write it.

      ## Documents
      - d1 [spec] docs/spec.md (revision r1)

      Document types you may register:
      - spec: Spec. Use when: always

      ## Operations you may call in this Turn
      Run them with the product CLI. Add \`--json\` for machine output. Anything else is refused.

      Writes (Specification S1):
      - \`nevo-specflow specs documents add S1 --path <path> (--stdin | --content-file <file> | --template <template>) [--type <type>]\` - Create a document in the Specification and register it.
      - \`nevo-specflow specs documents save S1 <document-id> --expected-revision <revision> (--stdin | --content-file <file>)\` - Replace the content of a registered document; the revision comes from a read.
      - \`nevo-specflow specs documents classify S1 <document-id> --type <type> --expected-revision <revision>\` - Give a registered document its type.

      Reads:
      - \`nevo-specflow specs documents list <spec-id>\` - List documents.
      - \`nevo-specflow specs documents read <spec-id> <document-id>\` - Read one.
      - \`nevo-specflow specs documents validate <spec-id>\` - Check documents.
      - \`nevo-specflow specs list\` - List Specifications.
      - \`nevo-specflow tasks list <spec-id>\` - List Tasks.
      - \`nevo-specflow tasks inspect <spec-id> <task-id>\` - Inspect a Task.
      - \`nevo-specflow workflow actions <spec-id>\` - See the available actions.
      - \`nevo-specflow workflow context <spec-id>\` - See the step context.
      - \`nevo-specflow docs find <terms...>\` - Find repository documentation.
      - \`nevo-specflow docs get <document-id...>\` - Read repository documentation.

      ## Rules
      - A new document needs a type: register it with \`--type\`, or classify it afterwards. A file that is not registered blocks the finish.
      - Decisions stay with the owner: when a choice is open, ask in the Session and do not decide it for them.
      - Save with the revision you read; if it changed, read again before writing.
      "
    `);
  });

  it('renders a Task subject with references and digests', () => {
    const context = {
      ...base,
      subject: { specId: 'S1', taskId: 'T1' },
      task: { id: 'T1', title: 'Do', type: 'impl' },
      agent: {
        ...agent,
        taskContext: {
          digest: 'abc',
          entries: [
            { kind: 'file', ref: 'a.md', path: 'a.md', sha256: 'h', bytes: 3, required: true },
            { kind: 'instructions', text: 'Be brief.', required: true },
          ],
        },
      },
    } as unknown as StepContext;
    expect(renderAgentBrief({ context, scope, docsSearch: { root: 'docs', mode: 'lexical' } }))
      .toMatchInlineSnapshot(`
      "# Brief: Draft
      Subject: Task T1 of Specification S1. Attempt 1.

      Purpose: Write it.

      Task: Do (type impl)

      ## Task context (digest abc)
      References only: read each file yourself.
      - file a.md (required; path a.md, 3 bytes, sha256 h)
      - instructions (required): Be brief.

      ## Documents
      - d1 [spec] docs/spec.md (revision r1)

      Document types you may register:
      - spec: Spec. Use when: always

      ## Documentation search
      Repository documentation under docs; search mode lexical. Use \`docs find\` and \`docs get\`.

      ## Operations you may call in this Turn
      Run them with the product CLI. Add \`--json\` for machine output. Anything else is refused.

      Writes (Specification S1):
      - \`nevo-specflow specs documents add S1 --path <path> (--stdin | --content-file <file> | --template <template>) [--type <type>]\` - Create a document in the Specification and register it.
      - \`nevo-specflow specs documents save S1 <document-id> --expected-revision <revision> (--stdin | --content-file <file>)\` - Replace the content of a registered document; the revision comes from a read.
      - \`nevo-specflow specs documents classify S1 <document-id> --type <type> --expected-revision <revision>\` - Give a registered document its type.

      Reads:
      - \`nevo-specflow specs documents list <spec-id>\` - List documents.
      - \`nevo-specflow specs documents read <spec-id> <document-id>\` - Read one.
      - \`nevo-specflow specs documents validate <spec-id>\` - Check documents.
      - \`nevo-specflow specs list\` - List Specifications.
      - \`nevo-specflow tasks list <spec-id>\` - List Tasks.
      - \`nevo-specflow tasks inspect <spec-id> <task-id>\` - Inspect a Task.
      - \`nevo-specflow workflow actions <spec-id>\` - See the available actions.
      - \`nevo-specflow workflow context <spec-id>\` - See the step context.
      - \`nevo-specflow docs find <terms...>\` - Find repository documentation.
      - \`nevo-specflow docs get <document-id...>\` - Read repository documentation.

      ## Rules
      - A new document needs a type: register it with \`--type\`, or classify it afterwards. A file that is not registered blocks the finish.
      - Decisions stay with the owner: when a choice is open, ask in the Session and do not decide it for them.
      - Save with the revision you read; if it changed, read again before writing.
      "
    `);
  });

  it('lists exactly the operations the scope admits', () => {
    expect(writeOperations(scope)).toHaveLength(scope.operations.length);
    const narrowed = { ...scope, operations: ['documents.save'] as const };
    const brief = renderAgentBrief({
      context: { ...base, subject: { specId: 'S1' } } as unknown as StepContext,
      scope: narrowed,
    });
    expect(brief).toContain('documents save');
    expect(brief).not.toContain('documents add');
    expect(brief).not.toContain('documents classify');
  });
});
