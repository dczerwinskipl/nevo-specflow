import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import type { ResolvedProjectHome } from '../project/home/home';

const closed = { additionalProperties: false } as const;
const identifier = Type.String({
  pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
});
const text = Type.String({ minLength: 1, maxLength: 32768 });
export const ExecutionIntentSchema = Type.Object(
  {
    operationId: identifier,
    ownerId: Type.String({ minLength: 1, maxLength: 256 }),
    binding: Type.String({ pattern: '^[0-9a-f]{64}$' }),
  },
  closed,
);
const ReceiptSchema = Type.Object(
  {
    invocationId: identifier,
    process: Type.Literal('stopped'),
    outcome: Type.Union([
      Type.Literal('completed'),
      Type.Literal('failed'),
      Type.Literal('cancelled'),
      Type.Literal('interrupted'),
    ]),
  },
  closed,
);
const JournalSchema = Type.Object(
  {
    version: Type.Literal(1),
    projectId: identifier,
    gitInstanceId: identifier,
    intent: ExecutionIntentSchema,
    workspace: Type.Object(
      { workspaceId: identifier, root: text, instanceId: Type.Optional(identifier) },
      closed,
    ),
    registryRevision: Type.Integer({ minimum: 0 }),
    resources: Type.Array(text, { minItems: 1, maxItems: 1 }),
    phase: Type.Union([
      Type.Literal('admitted'),
      Type.Literal('dispatched'),
      Type.Literal('unknown'),
      Type.Literal('settled'),
    ]),
    settlement: Type.Optional(
      Type.Union([
        Type.Object({ kind: Type.Literal('not-dispatched') }, closed),
        Type.Object({ kind: Type.Literal('native-result'), receipt: ReceiptSchema }, closed),
      ]),
    ),
  },
  closed,
);

export type WorkspaceExecutionIntent = Static<typeof ExecutionIntentSchema>;
export type WorkspaceExecutionReceipt = Static<typeof ReceiptSchema>;
export type WorkspaceExecutionJournal = Static<typeof JournalSchema>;

export class WorkspaceExecutionError extends Error {
  readonly code: 'EXECUTION_CONFLICT' | 'EXECUTION_CORRUPT' | 'EXECUTION_RECOVERY_REQUIRED';
  constructor(code: WorkspaceExecutionError['code'], message: string) {
    super(message);
    this.name = 'WorkspaceExecutionError';
    this.code = code;
  }
}
export function executionResources(context: ResolvedProjectHome): readonly string[] {
  // Native CLI tools can affect any ref/worktree in this repository. Do not
  // pretend that a cwd-only checkout claim contains those capabilities.
  return ['project-write:' + context.project.projectId];
}

export function parseExecutionJournal(
  context: ResolvedProjectHome,
  operationId: string,
  value: unknown,
): WorkspaceExecutionJournal {
  if (
    !Value.Check(JournalSchema, value) ||
    value.intent.operationId !== operationId ||
    value.projectId !== context.project.projectId ||
    value.gitInstanceId !== context.project.gitInstanceId ||
    value.resources.length !== 1 ||
    value.resources[0] !== executionResources(context)[0] ||
    (value.phase === 'settled') !== Boolean(value.settlement) ||
    (value.settlement?.kind === 'native-result' &&
      value.settlement.receipt.invocationId !== operationId)
  ) {
    throw new WorkspaceExecutionError(
      'EXECUTION_CORRUPT',
      'External execution journal is inconsistent.',
    );
  }

  return value;
}

export function validateExecutionIntent(value: WorkspaceExecutionIntent) {
  if (!Value.Check(ExecutionIntentSchema, value)) {
    throw new WorkspaceExecutionError(
      'EXECUTION_CONFLICT',
      'A bounded execution identity is required.',
    );
  }
}

export function validateExecutionReceipt(value: WorkspaceExecutionReceipt) {
  if (!Value.Check(ReceiptSchema, value)) {
    throw new WorkspaceExecutionError(
      'EXECUTION_RECOVERY_REQUIRED',
      'Positive native result and process settlement evidence are required.',
    );
  }
}
