import { sha256Hex } from '../../../hash';
import type { TaskContextEntry } from '../../../tasks/resource/model';
import type { TaskContextIssue } from '../../../tasks/resource/validate';
import { WorkflowError } from '../../errors';
import {
  AGENT_CONTEXT_CATALOGUE_BYTES_MAX,
  AGENT_CONTEXT_DOCUMENT_TYPES_MAX,
  AGENT_CONTEXT_DOCUMENTS_MAX,
  AGENT_CONTEXT_INSTRUCTIONS_BYTES_MAX,
  AGENT_CONTEXT_REFERENCE_BYTES_MAX,
} from '../../limits';
import { assertContextResolved } from '../../operations/task-policy';
import type {
  AgentContextFacts,
  AgentStepContext,
  ContextEntry,
  ContextEntryFact,
} from '../../operations/agent-step-context';

const bytesOf = (text: string): number => Buffer.byteLength(text, 'utf8');

function overBudget(what: string, limit: string): never {
  throw new WorkflowError(
    'WORKFLOW_INPUT_INVALID',
    `The agent context is over its budget: ${what} (at most ${limit}).`,
  );
}

/**
 * The agent data of a step context, from facts already read (pure). Documents keep their registry
 * order and document types the catalogue order (by id); the Task context keeps its declared order.
 * A required entry that does not resolve refuses the context (`WORKFLOW_TASK_CONTEXT_UNRESOLVED`); an
 * over-budget list or file refuses it too (`WORKFLOW_INPUT_INVALID`), nothing is cut silently.
 */
export function compileAgentContext(facts: AgentContextFacts): AgentStepContext {
  if (facts.documents.length > AGENT_CONTEXT_DOCUMENTS_MAX) {
    overBudget(
      `${String(facts.documents.length)} registered documents`,
      `${String(AGENT_CONTEXT_DOCUMENTS_MAX)} documents`,
    );
  }

  if (facts.documentTypes.length > AGENT_CONTEXT_DOCUMENT_TYPES_MAX) {
    overBudget(
      `${String(facts.documentTypes.length)} document types`,
      `${String(AGENT_CONTEXT_DOCUMENT_TYPES_MAX)} types`,
    );
  }

  const catalogueBytes =
    facts.documentTypes.reduce((sum, type) => sum + bytesOf(type.instructions), 0) +
    (facts.archetype?.templates ?? []).reduce(
      (sum, template) => sum + bytesOf(template.instructions ?? ''),
      0,
    );
  if (catalogueBytes > AGENT_CONTEXT_CATALOGUE_BYTES_MAX) {
    overBudget(
      'the instructions of the document types and templates',
      `${String(AGENT_CONTEXT_CATALOGUE_BYTES_MAX)} bytes`,
    );
  }

  const taskContext = facts.entries
    ? compileTaskContext(facts.taskId ?? '', facts.entries)
    : undefined;

  return {
    documents: facts.documents,
    documentTypes: facts.documentTypes,
    ...(facts.archetype ? { archetype: facts.archetype } : {}),
    ...(taskContext ? { taskContext } : {}),
  };
}

function compileTaskContext(
  taskId: string,
  facts: readonly ContextEntryFact[],
): NonNullable<AgentStepContext['taskContext']> {
  const unresolved: TaskContextIssue[] = facts.flatMap((fact, index) =>
    fact.found === undefined && fact.entry.kind !== 'instructions' && fact.entry.required
      ? [{ index, entry: fact.entry, reason: 'not-found' as const }]
      : [],
  );
  assertContextResolved(
    taskId,
    unresolved,
    'The agent context cannot be built until they exist, or are replaced or removed.',
  );

  let instructionBytes = 0;
  const entries = facts.map((fact): ContextEntry => {
    const entry: TaskContextEntry = fact.entry;
    if (entry.kind === 'instructions') {
      instructionBytes += bytesOf(entry.text);

      return { kind: 'instructions', text: entry.text, required: entry.required };
    }

    const ref = entry.kind === 'path' ? entry.path : entry.id;
    const file = fact.found?.file;
    if (file && file.bytes > AGENT_CONTEXT_REFERENCE_BYTES_MAX) {
      overBudget(
        `the file of the context reference "${ref}" is ${String(file.bytes)} bytes`,
        `${String(AGENT_CONTEXT_REFERENCE_BYTES_MAX)} bytes`,
      );
    }

    return {
      kind: entry.kind,
      ref,
      ...(file ? { path: file.path, bytes: file.bytes } : {}),
      ...(file?.sha256 !== undefined ? { sha256: file.sha256 } : {}),
      required: entry.required,
      ...(fact.found === undefined ? { missing: true as const } : {}),
    };
  });
  if (instructionBytes > AGENT_CONTEXT_INSTRUCTIONS_BYTES_MAX) {
    overBudget(
      'the inline instructions of the Task context',
      `${String(AGENT_CONTEXT_INSTRUCTIONS_BYTES_MAX)} bytes`,
    );
  }

  return { entries, digest: sha256Hex(JSON.stringify(entries)) };
}
