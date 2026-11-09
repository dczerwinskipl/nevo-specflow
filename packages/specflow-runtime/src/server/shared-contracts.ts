import type { FastifyInstance, RawServerBase } from 'fastify';
import { Type, type Static, type TSchema, type TUnsafe } from 'typebox';

import { AuthSessionResponseSchema } from '@nevo/specflow-contracts/authentication';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import {
  DocumentErrorSchema,
  DocumentOperationResultSchema,
  DocumentOperationStatusSchema,
} from '@nevo/specflow-contracts/documents';
import { OperationListResponseSchema } from '@nevo/specflow-contracts/operations';
import { SessionCommandResultSchema } from '@nevo/specflow-contracts/sessions';
import {
  CloseErrorSchema,
  ClosePreviewSchema,
  CloseResultSchema,
  CloseWorkspaceResultSchema,
  CreateSpecErrorSchema,
} from '@nevo/specflow-contracts/specs';
import { SpecificationReadErrorSchema } from '@nevo/specflow-contracts/specs/workspace';
import { TaskReadErrorSchema, TaskSnapshotExpiredSchema } from '@nevo/specflow-contracts/tasks';

/**
 * The response contracts of `@nevo/specflow-contracts` that more than one operation answers. Each
 * carries a stable `$id` in the contracts package; here it is only registered as a Fastify shared
 * schema, so routes reference one definition and the OpenAPI document emits it once under
 * `components.schemas` with that `$id` as its name. A contract answered by one operation only, and
 * a separate contract that merely has the same shape as another, stay inline.
 */
const SHARED_CONTRACTS: readonly TSchema[] = [
  AuthSessionResponseSchema,
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
  CloseErrorSchema,
  ClosePreviewSchema,
  CloseResultSchema,
  CloseWorkspaceResultSchema,
  CreateSpecErrorSchema,
  DocumentErrorSchema,
  DocumentOperationResultSchema,
  DocumentOperationStatusSchema,
  OperationListResponseSchema,
  SessionCommandResultSchema,
  SpecificationReadErrorSchema,
  TaskReadErrorSchema,
  TaskSnapshotExpiredSchema,
];

const sharedContracts = new Set<TSchema>(SHARED_CONTRACTS);

/**
 * Registers the shared contracts on the root instance. It MUST run before any route registration:
 * a route referencing a contract compiles only where the contract is visible, and registering on
 * the root makes it visible in every encapsulated plugin.
 */
export function registerSharedContracts<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
): void {
  for (const contract of SHARED_CONTRACTS) {
    app.addSchema(contract);
  }
}

/**
 * A route schema referencing a shared contract by its `$id`. Validation and serialization resolve
 * the reference to the registered definition, and route types keep the contract's static type.
 */
export function contractRef<Contract extends TSchema>(
  contract: Contract,
): TUnsafe<Static<Contract>> {
  const { $id } = contract as { readonly $id?: unknown };
  if (!sharedContracts.has(contract) || typeof $id !== 'string') {
    throw new Error('Only a registered shared contract with an `$id` can be referenced.');
  }

  return Type.Unsafe<Static<Contract>>({ $ref: $id });
}
