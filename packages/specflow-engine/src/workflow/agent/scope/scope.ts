/**
 * The write scope of an agent Turn (D11 point 6): derived from the trusted binding of the Turn,
 * never configured and never taken from a request. The Runtime broker only enforces it; the rules
 * of what a binding may do live here.
 *
 * Two bindings exist:
 *
 * - `ad-hoc`: a Turn of a Session associated with a Specification, without an agent attempt (D11b):
 *   it may create, save and classify documents of that home Specification;
 * - `attempt`: a Turn of an agent attempt of a step (agent step execution): the documents of its subject
 *   Specification, Task drafts (create, edit) only when the step declares `produces: tasks`, and the
 *   finish proposal of the bound attempt. A Task subject writes its Task's documents, never the
 *   Specification's own.
 */

/** Every write an agent may be granted. A scope admits a subset. */
export const AGENT_WRITE_OPERATIONS = [
  'documents.create',
  'documents.save',
  'documents.classify',
  'tasks.create',
  'tasks.edit',
  'workflow.finish',
] as const;
export type AgentWriteOperation = (typeof AGENT_WRITE_OPERATIONS)[number];

const DOCUMENT_OPERATIONS = ['documents.create', 'documents.save', 'documents.classify'] as const;

/** What a Turn is bound to, as the trusted host knows it. */
export type AgentScopeBinding =
  /** A Turn of a Session associated with `specId`, with no agent attempt (D11b). */
  | { readonly kind: 'ad-hoc'; readonly specId: string }
  /** A Turn of the agent attempt `step#attempt` of `specId` (or its Task `taskId`). */
  | {
      readonly kind: 'attempt';
      readonly specId: string;
      readonly taskId?: string;
      readonly attemptId: string;
      readonly step: string;
      readonly attempt: number;
      /** The step declares `produces: tasks`: the attempt may draft Tasks. */
      readonly producesTasks: boolean;
    };

export interface AgentWriteScope {
  readonly kind: AgentScopeBinding['kind'];
  /** The Specification every write of the Turn belongs to. */
  readonly specId: string;
  /** The attempt's Task subject; absent for a Specification subject and an ad-hoc Turn. */
  readonly taskId?: string;
  /** The bound attempt (`attempt` scope only). */
  readonly attempt?: {
    readonly attemptId: string;
    readonly step: string;
    readonly attempt: number;
  };
  /** The writes the Turn may make, in {@link AGENT_WRITE_OPERATIONS} order. */
  readonly operations: readonly AgentWriteOperation[];
}

/** The scope of a binding. Pure: the same binding always yields the same scope. */
export function deriveAgentScope(binding: AgentScopeBinding): AgentWriteScope {
  if (binding.kind === 'ad-hoc') {
    return { kind: 'ad-hoc', specId: binding.specId, operations: [...DOCUMENT_OPERATIONS] };
  }

  const operations: AgentWriteOperation[] = [
    ...DOCUMENT_OPERATIONS,
    ...(binding.producesTasks ? (['tasks.create', 'tasks.edit'] as const) : []),
    'workflow.finish',
  ];

  return {
    kind: 'attempt',
    specId: binding.specId,
    ...(binding.taskId !== undefined ? { taskId: binding.taskId } : {}),
    attempt: { attemptId: binding.attemptId, step: binding.step, attempt: binding.attempt },
    operations,
  };
}

/** What one request of the agent asks for, before the Engine is called. */
export interface AgentOperationTarget {
  /** The operation name the client sent (any string: an unknown one is refused). */
  readonly operation: string;
  readonly specId: string;
  /**
   * The Task the request names: a Task's documents, or (`workflow.finish`) the Task subject it
   * finishes; it must be the scope's Task subject. A Task draft's own id is not named here.
   */
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

const subjectOf = (scope: AgentWriteScope): string =>
  scope.taskId === undefined
    ? `Specification ${scope.specId}`
    : `Task ${scope.taskId} of Specification ${scope.specId}`;

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
      message: `This Turn writes only for Specification ${scope.specId}, not for ${target.specId}. Ask the owner in the Session to change the other Specification.`,
    };
  }

  // Documents and the finish proposal name the attempt's own subject (a Task's documents for a Task
  // subject); a Task draft names no subject.
  const expectedTask = target.operation.startsWith('tasks.') ? undefined : scope.taskId;
  if (target.taskId !== expectedTask) {
    return {
      admitted: false,
      reason: 'task-not-in-scope',
      message:
        target.taskId === undefined
          ? `This Turn works on ${subjectOf(scope)}; name it in the command.`
          : `This Turn works on ${subjectOf(scope)}, not on the documents or the step of Task ${target.taskId}. Ask the owner to start the Task's step.`,
    };
  }

  return { admitted: true, operation: target.operation };
}
