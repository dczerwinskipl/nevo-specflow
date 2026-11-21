import type { AgentWriteOperation, AgentWriteScope } from '@nevo/specflow-engine';

/**
 * The operations section of the agent brief, generated from the scope the broker enforces (D13):
 * a write is listed only when the scope admits it, so the brief never names a command the broker
 * refuses. The table is exhaustive over `AgentWriteOperation`: a write added to the Engine scope
 * (the attempt scope's Task drafts and finish proposal) fails to compile here until its CLI form
 * is declared.
 */
export interface BriefOperation {
  readonly form: string;
  readonly purpose: string;
}

const WRITE_FORMS: Record<AgentWriteOperation, (specId: string) => BriefOperation> = {
  'documents.create': (specId) => ({
    form: `nevo-specflow specs documents add ${specId} --path <path> (--stdin | --content-file <file> | --template <template>) [--type <type>]`,
    purpose: 'Create a document in the Specification and register it.',
  }),
  'documents.save': (specId) => ({
    form: `nevo-specflow specs documents save ${specId} <document-id> --expected-revision <revision> (--stdin | --content-file <file>)`,
    purpose: 'Replace the content of a registered document; the revision comes from a read.',
  }),
  'documents.classify': (specId) => ({
    form: `nevo-specflow specs documents classify ${specId} <document-id> --type <type> --expected-revision <revision>`,
    purpose: 'Give a registered document its type.',
  }),
};

/** Reads are always allowed; they change nothing. Add `--json` for machine output. */
export const READ_OPERATIONS: readonly BriefOperation[] = [
  { form: 'nevo-specflow specs documents list <spec-id>', purpose: 'List documents.' },
  { form: 'nevo-specflow specs documents read <spec-id> <document-id>', purpose: 'Read one.' },
  { form: 'nevo-specflow specs documents validate <spec-id>', purpose: 'Check documents.' },
  { form: 'nevo-specflow specs list', purpose: 'List Specifications.' },
  { form: 'nevo-specflow tasks list <spec-id>', purpose: 'List Tasks.' },
  { form: 'nevo-specflow tasks inspect <spec-id> <task-id>', purpose: 'Inspect a Task.' },
  { form: 'nevo-specflow workflow actions <spec-id>', purpose: 'See the available actions.' },
  { form: 'nevo-specflow workflow context <spec-id>', purpose: 'See the step context.' },
  { form: 'nevo-specflow docs find <terms...>', purpose: 'Find repository documentation.' },
  { form: 'nevo-specflow docs get <document-id...>', purpose: 'Read repository documentation.' },
];

/** The writes the scope admits with their exact CLI forms, in the scope's order. */
export function writeOperations(scope: AgentWriteScope): readonly BriefOperation[] {
  return scope.operations.map((operation) => WRITE_FORMS[operation](scope.specId));
}

/** The operations section: the writes of the scope, then the reads. */
export function renderOperations(scope: AgentWriteScope): string {
  const line = (operation: BriefOperation) => `- \`${operation.form}\` - ${operation.purpose}`;

  return [
    '## Operations you may call in this Turn',
    'Run them with the product CLI. Add `--json` for machine output. Anything else is refused.',
    '',
    `Writes (Specification ${scope.specId}):`,
    ...writeOperations(scope).map(line),
    '',
    'Reads:',
    ...READ_OPERATIONS.map(line),
  ].join('\n');
}
