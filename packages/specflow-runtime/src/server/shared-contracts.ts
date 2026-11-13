import type { FastifyInstance, RawServerBase } from 'fastify';
import { Type, type Static, type TSchema, type TUnsafe } from 'typebox';

import { AuthSessionResponseSchema } from '@nevo/specflow-contracts/authentication';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import { DocsSearchResultSchema, DocsStatusSchema } from '@nevo/specflow-contracts/docs';
import {
  DocumentErrorSchema,
  DocumentOperationResultSchema,
  DocumentOperationStatusSchema,
  SpecIdSchema,
  TaskIdSchema,
  WorkspaceIdSchema,
} from '@nevo/specflow-contracts/documents';
import {
  OperationIdSchema,
  OperationListResponseSchema,
} from '@nevo/specflow-contracts/operations';
import {
  ContentIdSchema,
  InteractionIdSchema,
  SessionCommandResultSchema,
  SessionErrorSchema,
  SessionIdSchema,
  TurnIdSchema,
  WorkIdSchema,
} from '@nevo/specflow-contracts/sessions';
import {
  CloseErrorSchema,
  ClosePreviewSchema,
  CloseResultSchema,
  CloseWorkspaceResultSchema,
  CreateSpecErrorSchema,
} from '@nevo/specflow-contracts/specs';
import { SpecificationReadErrorSchema } from '@nevo/specflow-contracts/specs/workspace';
import {
  RateLimitedErrorResponseSchema,
  RequestErrorResponseSchema,
} from '@nevo/specflow-contracts/runtime';
import {
  WorkflowActionProjectionSchema,
  WorkflowErrorSchema,
} from '@nevo/specflow-contracts/workflow';
import {
  TaskChangeResultSchema,
  TaskReadErrorSchema,
  TaskSnapshotExpiredSchema,
} from '@nevo/specflow-contracts/tasks';

/**
 * The response contracts of `@nevo/specflow-contracts` that more than one operation answers, or that
 * one operation answers and another product surface emits too (`DocsSearchResult` and `DocsStatus`
 * are also the `nevo-specflow docs search --json` and `docs semantic status --json` output). Each
 * carries a stable `$id` in the contracts package; here it is only registered as a Fastify shared
 * schema, so routes reference one definition and the
 * OpenAPI document emits it once under `components.schemas` with that `$id` as its name. A contract
 * answered by one operation only, and a separate contract that merely has the same shape as
 * another, stay inline.
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
  DocsSearchResultSchema,
  DocsStatusSchema,
  DocumentErrorSchema,
  DocumentOperationResultSchema,
  DocumentOperationStatusSchema,
  OperationListResponseSchema,
  RateLimitedErrorResponseSchema,
  RequestErrorResponseSchema,
  SessionCommandResultSchema,
  SessionErrorSchema,
  SpecificationReadErrorSchema,
  TaskChangeResultSchema,
  TaskReadErrorSchema,
  TaskSnapshotExpiredSchema,
  WorkflowActionProjectionSchema,
  WorkflowErrorSchema,
];

const sharedContracts = new Set<TSchema>(SHARED_CONTRACTS);

/**
 * The domain identifiers of `@nevo/specflow-contracts` that several operations share. An identifier
 * is used inline in many schemas (route parameters, bodies, other contracts), so it cannot carry an
 * `$id`: one request schema would then resolve the same `$id` twice, which Ajv refuses. It carries
 * its name as `title` instead; it is registered under that name, and the OpenAPI document references
 * the component wherever a route schema uses the identifier (`referenceSharedIdentifiers`).
 * Validation and serialization keep the inline schema.
 */
const SHARED_IDENTIFIERS: readonly TSchema[] = [
  ContentIdSchema,
  InteractionIdSchema,
  OperationIdSchema,
  SessionIdSchema,
  SpecIdSchema,
  TaskIdSchema,
  TurnIdSchema,
  WorkIdSchema,
  WorkspaceIdSchema,
];

const sharedIdentifiers = new Map<string, TSchema>(
  SHARED_IDENTIFIERS.map((identifier) => [identifierName(identifier), identifier]),
);

function identifierName(identifier: TSchema): string {
  const { title } = identifier as { readonly title?: unknown };
  if (typeof title !== 'string') {
    throw new Error('A shared identifier must carry its name as `title`.');
  }

  return title;
}

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

  for (const [name, identifier] of sharedIdentifiers) {
    app.addSchema({ ...identifier, $id: name });
  }
}

/**
 * A copy of a schema in which every use of a shared identifier (a subschema whose `title` names
 * one) is a reference to it. A subschema with that `title` that is not the identifier's definition
 * is refused: one name, one definition. Only the OpenAPI document reads the copy.
 *
 * A route schema references the identifier by its Fastify name (`@fastify/swagger` resolves it);
 * a component of the generated document by its `#/components/schemas/` pointer.
 */
export function referenceSharedIdentifiers(
  schema: unknown,
  reference: (name: string) => string = (name) => name,
): unknown {
  if (Array.isArray(schema)) {
    return schema.map((item) => referenceSharedIdentifiers(item, reference));
  }

  if (typeof schema !== 'object' || schema === null) {
    return schema;
  }

  const { title } = schema as { readonly title?: unknown };
  const identifier = typeof title === 'string' ? sharedIdentifiers.get(title) : undefined;
  if (identifier) {
    if (!sameDefinition(schema, identifier)) {
      throw new Error(`A schema titled ${String(title)} differs from the shared identifier.`);
    }

    return { $ref: reference(title as string) };
  }

  return Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [
      key,
      referenceSharedIdentifiers(value, reference),
    ]),
  );
}

/**
 * The `components.schemas` of a generated document in which a shared contract references the
 * shared identifiers it contains, as route schemas do. An identifier's own component stays its
 * definition. Only the document changes; the registered contracts keep their inline identifiers.
 */
export function referenceIdentifiersInComponents<Components extends Record<string, unknown>>(
  components: Components,
): Components {
  // A reference is a schema too, so the copy keeps the type of the generated components.
  return Object.fromEntries(
    Object.entries(components).map(([name, component]) => [
      name,
      sharedIdentifiers.has(name)
        ? component
        : referenceSharedIdentifiers(
            component,
            (identifier) => `#/components/schemas/${identifier}`,
          ),
    ]),
  ) as Components;
}

/** The same JSON Schema keywords and values (an identifier is a flat schema of scalars). */
function sameDefinition(schema: object, identifier: TSchema): boolean {
  const keys = Object.keys(identifier);

  return (
    Object.keys(schema).length === keys.length &&
    keys.every(
      (key) =>
        (schema as Record<string, unknown>)[key] === (identifier as Record<string, unknown>)[key],
    )
  );
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
