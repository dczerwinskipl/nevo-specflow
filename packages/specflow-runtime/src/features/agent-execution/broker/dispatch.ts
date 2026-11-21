import {
  AGENT_BROKER_PROTOCOL,
  AgentBrokerRequestIdSchema,
  AgentBrokerRequestSchema,
  type AgentBrokerError,
  type AgentBrokerRequest,
  type AgentBrokerResponse,
  type AgentBrokerResult,
} from '@nevo/specflow-contracts/runtime';
import type {
  CreateDocumentsInput,
  DocumentOperationInput,
  DocumentOperationResult,
  SaveInput,
  SaveResult,
} from '@nevo/specflow-contracts/documents';
import type {
  CreateTaskInput,
  EditTaskInput,
  TaskChangeResult,
} from '@nevo/specflow-contracts/tasks';
import type { AgentFinishProposalRequest } from '@nevo/specflow-contracts/workflow';
import { DocumentError, admitAgentOperation, type OwnedExecution } from '@nevo/specflow-engine';
import { Type, type Static, type TSchema } from 'typebox';
import { Value } from 'typebox/value';

import type {
  CapabilityBinding,
  CapabilityLease,
  CapabilityRegistry,
} from '../capability/registry';
import { brokerOperationId } from './operation-id';

/** The Engine document use cases the broker calls: the same ones the UI's routes call. */
export interface BrokerDocuments {
  /** The workspace root the Specification lives in now, or `undefined` when it is not available. */
  workspaceOf(specId: string): Promise<string | undefined>;
  create(
    specId: string,
    input: CreateDocumentsInput,
    owned: OwnedExecution,
  ): Promise<DocumentOperationResult>;
  save(
    specId: string,
    documentId: string,
    input: SaveInput,
    owned: OwnedExecution,
  ): Promise<SaveResult>;
  operate(
    specId: string,
    input: DocumentOperationInput,
    owned: OwnedExecution,
  ): Promise<DocumentOperationResult>;
}

/**
 * The Engine workflow use cases an agent attempt's Turn calls through the broker (Task drafts of its
 * producing step, its finish proposal), each as the Turn's owned execution with the binding's actor.
 */
export interface BrokerWorkflow {
  createTask(
    binding: CapabilityBinding,
    input: CreateTaskInput & { readonly specId: string },
  ): Promise<TaskChangeResult>;
  editTask(
    binding: CapabilityBinding,
    input: EditTaskInput & { readonly specId: string; readonly taskId: string },
  ): Promise<TaskChangeResult>;
  propose(
    binding: CapabilityBinding,
    input: AgentFinishProposalRequest,
  ): Promise<{ readonly kind: 'recorded' | 'replaced' | 'replayed'; readonly transition: string }>;
}

/** Turns an Engine refusal into the agent's answer; anything else is not a refusal. */
export type BrokerRefusalOf = (
  error: unknown,
) => { readonly code: string; readonly message: string; readonly details?: object } | undefined;

/**
 * Field names only the broker decides. A request naming one (at any depth) is refused, never
 * silently ignored: the actor, the claim, the owner, the operation, invocation, Session and Turn
 * ids, the workspace and the scope come from the capability alone (D11 point 3, invariant 2).
 */
const DECIDED_BY_BROKER = new Set([
  'operationid',
  'invocationid',
  'sessionid',
  'turnid',
  'attempt',
  'workspace',
  'workspaceid',
  'workspaceroot',
  'scope',
  'trust',
  'principal',
]);
const DECIDED_PREFIXES = ['actor', 'claim', 'owner', 'ignoreclaim', 'ownedexecution', 'authorit'];

function decidedField(value: unknown, depth = 0): string | undefined {
  if (depth > 32 || value === null || typeof value !== 'object') {
    return undefined;
  }

  for (const [key, entry] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const exempt = depth === 0 && key === 'capability';
    if (
      !exempt &&
      (DECIDED_BY_BROKER.has(normalized) ||
        DECIDED_PREFIXES.some((prefix) => normalized.startsWith(prefix)))
    ) {
      return key;
    }

    const nested = decidedField(entry, depth + 1);
    if (nested !== undefined) {
      return nested;
    }
  }

  return undefined;
}

/** What must hold before the capability is looked at; the operation is checked after it. */
const EnvelopeSchema = Type.Object({
  protocol: Type.Literal(AGENT_BROKER_PROTOCOL),
  capability: Type.String({ minLength: 1, maxLength: 512 }),
  requestId: AgentBrokerRequestIdSchema,
  operation: Type.Object({ name: Type.String({ minLength: 1, maxLength: 64 }) }),
});

function firstError(schema: TSchema, value: unknown): string {
  const first = Value.Errors(schema, value)[0];

  return first ? ` (${first.instancePath || '/'}: ${first.message})` : '';
}

/** `code`: an {@link AgentBrokerErrorCode}, or the Engine's document error code it passes on. */
const refusal = (
  code: string,
  message: string,
  details?: Record<string, unknown>,
): AgentBrokerResponse => {
  const error: AgentBrokerError = {
    code,
    message,
    ...(details !== undefined ? { details } : {}),
  };

  return { ok: false, error };
};

const CAPABILITY_REFUSALS = {
  unknown:
    'This command is not part of a running agent Turn of this Runtime (no valid agent capability). Ask the owner to make the change.',
  'not-dispatched': 'The agent Turn has not started yet; retry once it runs.',
  ended:
    'The agent Turn this command belonged to has ended; its capability is no longer valid. Ask the owner to make the change.',
} as const;

/**
 * The broker's decision for one request frame. Order: the frame parses; no field names what only
 * the broker decides; the shape is this protocol's; the capability is a running Turn's; the
 * operation is in its scope; the Specification still lives in the claimed workspace. Only then is
 * an Engine use case called, as the Turn's owned execution, with an operation id derived from the
 * invocation and the client's request id.
 */
export function createBrokerDispatcher(options: {
  registry: CapabilityRegistry;
  documents: BrokerDocuments;
  /** The attempt scope's workflow writes; absent: those operations are unavailable. */
  workflow?: BrokerWorkflow;
  /** Maps workflow refusals (the workflow routes' mapping). */
  refusalOf?: BrokerRefusalOf;
}) {
  const { registry, documents } = options;
  const unavailable = (): never => {
    throw new Error('The broker has no workflow writes.');
  };

  async function run(
    request: AgentBrokerRequest,
    lease: CapabilityLease,
  ): Promise<AgentBrokerResponse> {
    const binding = lease.binding;
    const operation = request.operation;
    if (operation.name === 'scope.describe') {
      return {
        ok: true,
        value: {
          operation: 'scope.describe',
          scope: {
            kind: binding.scope.kind,
            specId: binding.scope.specId,
            ...(binding.scope.taskId !== undefined ? { taskId: binding.scope.taskId } : {}),
            ...(binding.scope.attempt !== undefined
              ? {
                  attempt: {
                    step: binding.scope.attempt.step,
                    attempt: binding.scope.attempt.attempt,
                  },
                }
              : {}),
            operations: ['scope.describe', ...binding.scope.operations],
          },
        },
      };
    }

    const decision = admitAgentOperation(binding.scope, {
      operation: operation.name,
      specId: operation.specId,
      ...(operation.name === 'workflow.finish' && operation.taskId !== undefined
        ? { taskId: operation.taskId }
        : {}),
    });
    if (!decision.admitted) {
      return refusal('AGENT_SCOPE_REFUSED', decision.message, {
        reason: decision.reason,
        operation: operation.name,
      });
    }

    if ((await documents.workspaceOf(operation.specId)) !== binding.workspace) {
      return refusal(
        'AGENT_SCOPE_REFUSED',
        "The Specification no longer lives in this Turn's workspace; stop and tell the owner.",
        { reason: 'workspace-changed', operation: operation.name },
      );
    }

    // The Turn may have ended while the broker waited: checked again right before the Engine runs.
    // From here the call is counted, so the claim does not settle until it finished.
    if (!lease.active()) {
      return refusal('AGENT_CAPABILITY_INVALID', CAPABILITY_REFUSALS.ended, { reason: 'ended' });
    }

    if (
      operation.name === 'workflow.finish' &&
      (operation.step !== binding.scope.attempt?.step ||
        operation.stepAttempt !== binding.scope.attempt.attempt)
    ) {
      const bound = binding.scope.attempt;

      return refusal(
        'AGENT_SCOPE_REFUSED',
        bound
          ? `This Turn works on step "${bound.step}", attempt ${String(bound.attempt)}; finish exactly that.`
          : 'This Turn has no attempt to finish.',
        { reason: 'other-attempt', operation: operation.name },
      );
    }

    const operationId = brokerOperationId(binding.invocationId, request.requestId);
    const owned: OwnedExecution = { operationId: binding.invocationId, actor: binding.actor };
    let value: AgentBrokerResult;
    switch (operation.name) {
      case 'documents.create':
        value = {
          operation: operation.name,
          result: await documents.create(
            operation.specId,
            {
              operationId,
              documents: operation.documents,
              ...(operation.folders !== undefined ? { folders: operation.folders } : {}),
              ...(operation.catalogueRevision !== undefined
                ? { catalogueRevision: operation.catalogueRevision }
                : {}),
            },
            owned,
          ),
        };
        break;
      case 'documents.save':
        value = {
          operation: operation.name,
          result: await documents.save(
            operation.specId,
            operation.documentId,
            {
              operationId,
              content: operation.content,
              expectedRevision: operation.expectedRevision,
            },
            owned,
          ),
        };
        break;
      case 'documents.classify':
        value = {
          operation: operation.name,
          result: await documents.operate(
            operation.specId,
            {
              operationId,
              action: 'classify',
              kind: 'document',
              documentId: operation.documentId,
              type: operation.type,
              expectedRevision: operation.expectedRevision,
            },
            owned,
          ),
        };
        break;
      case 'tasks.create': {
        const { name: _name, ...input } = operation;
        value = {
          operation: operation.name,
          result: await (options.workflow ?? unavailable()).createTask(binding, input),
        };
        break;
      }

      case 'tasks.edit': {
        const { name: _name, ...input } = operation;
        value = {
          operation: operation.name,
          result: await (options.workflow ?? unavailable()).editTask(binding, input),
        };
        break;
      }

      case 'workflow.finish': {
        const { name: _name, specId: _spec, taskId: _task, stepAttempt, ...input } = operation;
        value = {
          operation: operation.name,
          result: await (options.workflow ?? unavailable()).propose(binding, {
            ...input,
            attempt: stepAttempt,
          }),
        };
        break;
      }
    }

    return { ok: true, value };
  }

  return {
    /** Never throws: every failure is a response the agent can read. */
    async handle(frame: string): Promise<AgentBrokerResponse> {
      let parsed: unknown;
      try {
        parsed = JSON.parse(frame);
      } catch {
        return refusal('AGENT_REQUEST_INVALID', 'The request is not JSON.');
      }

      const decided = decidedField(parsed);
      if (decided !== undefined) {
        return refusal(
          'AGENT_REQUEST_REFUSED',
          `The request names "${decided}", which only the Runtime decides (the actor, claim, owner, operation and scope come from the agent capability). Send the command without it.`,
          { field: decided },
        );
      }

      const capability = (parsed as { capability?: unknown } | null)?.capability;
      if (typeof capability !== 'string' || capability.length === 0) {
        return refusal('AGENT_CAPABILITY_INVALID', CAPABILITY_REFUSALS.unknown, {
          reason: 'unknown',
        });
      }

      if (!Value.Check(EnvelopeSchema, parsed)) {
        return refusal(
          'AGENT_REQUEST_INVALID',
          `The request is not a valid agent broker request${firstError(EnvelopeSchema, parsed)}.`,
        );
      }

      const admitted = registry.enter(parsed.capability);
      if (admitted.status !== 'valid') {
        return refusal('AGENT_CAPABILITY_INVALID', CAPABILITY_REFUSALS[admitted.status], {
          reason: admitted.status,
        });
      }

      try {
        return await admittedRequest(parsed, admitted.lease);
      } finally {
        admitted.lease.release();
      }
    },
  };

  async function admittedRequest(
    parsed: Static<typeof EnvelopeSchema>,
    lease: CapabilityLease,
  ): Promise<AgentBrokerResponse> {
    const scope = lease.binding.scope;
    // A write the protocol or the scope does not know is the scope's refusal, never a fallback.
    const name = parsed.operation.name;
    if (name !== 'scope.describe' && !scope.operations.some((op) => op === name)) {
      const decision = admitAgentOperation(scope, { operation: name, specId: scope.specId });

      return refusal(
        'AGENT_SCOPE_REFUSED',
        decision.admitted ? 'The operation is not in scope.' : decision.message,
        { reason: 'operation-not-in-scope', operation: name },
      );
    }

    if (!Value.Check(AgentBrokerRequestSchema, parsed)) {
      return refusal(
        'AGENT_REQUEST_INVALID',
        `The ${name} request is not valid${firstError(AgentBrokerRequestSchema, parsed)}.`,
      );
    }

    try {
      return await run(parsed, lease);
    } catch (error) {
      if (error instanceof DocumentError) {
        return refusal(error.code, error.message, error.details);
      }

      const refused = options.refusalOf?.(error);
      if (refused) {
        return refusal(
          refused.code,
          refused.message,
          refused.details as Record<string, unknown> | undefined,
        );
      }

      return refusal(
        'AGENT_BROKER_UNAVAILABLE',
        'The Runtime could not run the operation; tell the owner.',
      );
    }
  }
}

export type BrokerDispatcher = ReturnType<typeof createBrokerDispatcher>;
