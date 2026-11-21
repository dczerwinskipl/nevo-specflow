/**
 * The write scope of an agent Turn (D11 point 6): derived from the trusted binding of the Turn,
 * never configured and never taken from a request. The Runtime broker only enforces it; the rules
 * of what a binding may do live here.
 *
 * Today one binding exists: an ad-hoc Turn of a Session associated with a Specification, without an
 * agent attempt (D11b), which may create, save and classify documents of that home Specification.
 * The attempt binding (an agent attempt of a step) joins as a second `kind`, with the documents of
 * its subject, Task drafts for a `produces: tasks` step and the finish proposal of the bound attempt.
 */

/** Every write an agent may be granted. A scope admits a subset. */
export const AGENT_WRITE_OPERATIONS = [
  'documents.create',
  'documents.save',
  'documents.classify',
] as const;
export type AgentWriteOperation = (typeof AGENT_WRITE_OPERATIONS)[number];

/**
 * What a Turn is bound to, as the trusted host knows it. The attempt binding (subject, step,
 * attempt) joins as a union member with its own `kind`.
 */
export interface AgentScopeBinding {
  /** A Turn of a Session associated with `specId`, with no agent attempt (D11b). */
  readonly kind: 'ad-hoc';
  readonly specId: string;
}

export interface AgentWriteScope {
  readonly kind: AgentScopeBinding['kind'];
  /** The Specification every write of the Turn belongs to. */
  readonly specId: string;
  /** The writes the Turn may make, in {@link AGENT_WRITE_OPERATIONS} order. */
  readonly operations: readonly AgentWriteOperation[];
}

/** The scope of a binding. Pure: the same binding always yields the same scope. */
export function deriveAgentScope(binding: AgentScopeBinding): AgentWriteScope {
  return {
    kind: 'ad-hoc',
    specId: binding.specId,
    operations: ['documents.create', 'documents.save', 'documents.classify'],
  };
}

/** What one request of the agent asks for, before the Engine is called. */
export interface AgentOperationTarget {
  /** The operation name the client sent (any string: an unknown one is refused). */
  readonly operation: string;
  readonly specId: string;
  /** A Task's documents; absent for the Specification's own documents. */
  readonly taskId?: string;
}

export type AgentScopeRefusalReason =
  'operation-not-in-scope' | 'other-specification' | 'task-not-in-scope';

export type AgentScopeDecision =
  | { readonly admitted: true; readonly operation: AgentWriteOperation }
  | {
      readonly admitted: false;
      readonly reason: AgentScopeRefusalReason;
      /** What the agent can do about it (names no path). */
      readonly message: string;
    };

const isWriteOperation = (name: string): name is AgentWriteOperation =>
  (AGENT_WRITE_OPERATIONS as readonly string[]).includes(name);

/** Whether `target` is inside `scope`, with a reason an agent can act on when it is not. */
export function admitAgentOperation(
  scope: AgentWriteScope,
  target: AgentOperationTarget,
): AgentScopeDecision {
  const allowed = scope.operations.join(', ');
  if (!isWriteOperation(target.operation) || !scope.operations.includes(target.operation)) {
    return {
      admitted: false,
      reason: 'operation-not-in-scope',
      message: `This Turn may not run ${target.operation}; it may run only: ${allowed}. Ask the owner in the Session to do it.`,
    };
  }

  if (target.specId !== scope.specId) {
    return {
      admitted: false,
      reason: 'other-specification',
      message: `This Turn writes only the documents of Specification ${scope.specId}, not of ${target.specId}. Ask the owner in the Session to change the other Specification.`,
    };
  }

  if (target.taskId !== undefined) {
    return {
      admitted: false,
      reason: 'task-not-in-scope',
      message: `This Turn writes only the Specification's own documents, not the documents of Task ${target.taskId}. Ask the owner to start the Task's step.`,
    };
  }

  return { admitted: true, operation: target.operation };
}
