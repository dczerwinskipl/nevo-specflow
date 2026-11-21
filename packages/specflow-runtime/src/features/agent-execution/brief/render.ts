import type {
  AgentWriteScope,
  ContextDocument,
  ContextEntry,
  StepContext,
} from '@nevo/specflow-engine';

import { renderOperations } from './operations';

/**
 * Renders the agent brief (D13): the Engine owns the data (`StepContext` with its agent part), the
 * Runtime only renders it. Context entries are references with digests, never file content; only
 * `instructions` entries are inline. The operations section follows the broker scope.
 */
export interface BriefInput {
  readonly context: StepContext;
  readonly scope: AgentWriteScope;
  /** The workspace documentation search the agent may use: its root and how it ranks. */
  readonly docsSearch?: { readonly root: string; readonly mode: 'hybrid' | 'lexical' };
}

const subjectLabel = (context: StepContext): string =>
  context.task
    ? `Task ${context.task.id} of Specification ${context.subject.specId}`
    : `Specification ${context.subject.specId}`;

function renderEntry(entry: ContextEntry): string {
  const need = entry.required ? 'required' : 'optional';
  if (entry.kind === 'instructions') {
    return `- instructions (${need}): ${entry.text}`;
  }

  const facts = [
    entry.path !== undefined ? `path ${entry.path}` : undefined,
    entry.files !== undefined ? `${entry.files} files` : undefined,
    entry.bytes !== undefined ? `${entry.bytes} bytes` : undefined,
    entry.sha256 !== undefined ? `sha256 ${entry.sha256}` : undefined,
    entry.missing ? 'missing' : undefined,
  ].filter((fact) => fact !== undefined);

  return `- ${entry.kind} ${entry.ref} (${need}${facts.length ? '; ' + facts.join(', ') : ''})`;
}

const renderDocument = (document: ContextDocument): string =>
  `- ${document.id} [${document.type}] ${document.path} (revision ${document.revision}${
    document.templateOnly ? ', template content only' : ''
  })`;

export function renderAgentBrief(input: BriefInput): string {
  const { context, scope, docsSearch } = input;
  const agent = context.agent;
  const sections: string[] = [];

  sections.push(
    `# Brief: ${context.step.title}`,
    `Subject: ${subjectLabel(context)}. Attempt ${context.attempt}.`,
    '',
    `Purpose: ${context.step.purpose}`,
  );
  if (context.step.instructions) {
    sections.push('', 'Step instructions:', context.step.instructions);
  }

  if (context.archetype) {
    sections.push('', `Archetype: ${context.archetype.title} (${context.archetype.id})`);
    if (context.archetype.profile) {
      sections.push(context.archetype.profile);
    }

    if (context.archetype.instructions) {
      sections.push(context.archetype.instructions);
    }
  }

  if (context.task) {
    sections.push(
      '',
      `Task: ${context.task.title} (type ${context.task.type})`,
      ...(context.task.summary ? [context.task.summary] : []),
      ...(context.task.typeInstructions ? [context.task.typeInstructions] : []),
    );
  }

  if (context.handoff) {
    sections.push('', 'Handoff from the previous step:', JSON.stringify(context.handoff));
  }

  if (agent?.taskContext) {
    sections.push(
      '',
      `## Task context (digest ${agent.taskContext.digest})`,
      'References only: read each file yourself.',
      ...agent.taskContext.entries.map(renderEntry),
    );
  }

  if (agent) {
    sections.push(
      '',
      '## Documents',
      ...(agent.documents.length ? agent.documents.map(renderDocument) : ['- none']),
      '',
      'Document types you may register:',
      ...agent.documentTypes.map(
        (type) => `- ${type.id}: ${type.title}. Use when: ${type.useWhen}`,
      ),
    );
    if (agent.archetype) {
      sections.push(
        '',
        `Archetype ${agent.archetype.id} requires: ${
          agent.archetype.requirements
            .map((rule) => `${rule.minCount} x ${rule.documentType}`)
            .join(', ') || 'nothing'
        }.`,
      );
    }
  }

  if (docsSearch) {
    sections.push(
      '',
      '## Documentation search',
      `Repository documentation under ${docsSearch.root}; search mode ${docsSearch.mode}. Use \`docs find\` and \`docs get\`.`,
    );
  }

  sections.push('', renderOperations(scope));
  sections.push(
    '',
    '## Rules',
    '- A new document needs a type: register it with `--type`, or classify it afterwards. A file that is not registered blocks the finish.',
    '- Decisions stay with the owner: when a choice is open, ask in the Session and do not decide it for them.',
    '- Save with the revision you read; if it changed, read again before writing.',
  );

  return sections.join('\n') + '\n';
}
