// What the workspace documentation routes share: the `docs.view` guard's options, the error
// responses, and the answer to a workspace that cannot be read.

import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import {
  WorkspaceDocsErrorSchema,
  type WorkspaceDocsError,
  type WorkspaceDocsErrorCode,
} from '@nevo/specflow-contracts/docs';
import { WorkspaceIdSchema } from '@nevo/specflow-contracts/documents';
import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify';
import { Type } from 'typebox';

import { contractRef } from '../../server/shared-contracts';
import type { WorkspaceDocsOperations } from './workspace-corpus/operations';
import type { WorkspaceDocsFailure } from './workspace-corpus/workspace-corpora';

/** The Runtime's project id: `undefined` without an Engine (demo data, Runtimes without a project). */
export type DocsProjectId = () => string | undefined;

export interface WorkspaceDocsEndpointOptions {
  /** Absent without an Engine (demo data): every route answers `503 DOCS_UNAVAILABLE`. */
  readonly operations: WorkspaceDocsOperations | undefined;
  readonly projectId: DocsProjectId;
}

/**
 * Only the id's form is validated here; whether it names a registered workspace is decided by the
 * handler, after the `docs.view` guard, so a denied caller learns nothing about the registry.
 */
export const WorkspaceDocsParamsSchema = Type.Object(
  { workspaceId: WorkspaceIdSchema },
  { additionalProperties: false },
);

const MESSAGES: Readonly<Record<WorkspaceDocsErrorCode, string>> = {
  DOCS_WORKSPACE_NOT_FOUND: 'The workspace is not registered.',
  DOCS_WORKSPACE_UNAVAILABLE: 'The workspace cannot be read now.',
  DOCS_NOT_CONFIGURED: 'The workspace has no documentation folder (docs.root).',
  DOCS_UNAVAILABLE: 'The documentation of the workspace is unavailable.',
};

const STATUS: Readonly<Record<WorkspaceDocsErrorCode, number>> = {
  DOCS_WORKSPACE_NOT_FOUND: 404,
  DOCS_WORKSPACE_UNAVAILABLE: 409,
  DOCS_NOT_CONFIGURED: 503,
  DOCS_UNAVAILABLE: 503,
};

const CODES: Readonly<Record<WorkspaceDocsFailure['kind'], WorkspaceDocsErrorCode>> = {
  'workspace-not-found': 'DOCS_WORKSPACE_NOT_FOUND',
  'workspace-unavailable': 'DOCS_WORKSPACE_UNAVAILABLE',
  'not-configured': 'DOCS_NOT_CONFIGURED',
  'docs-unavailable': 'DOCS_UNAVAILABLE',
};

export function workspaceDocsError(code: WorkspaceDocsErrorCode): WorkspaceDocsError {
  return { error: MESSAGES[code], code };
}

/**
 * `onRequest` hook of every workspace documentation route: each answer, the guard's `401` and `403`
 * and a validation `400` included, is `Cache-Control: no-store` (ADR 0022 §2). No route sends an
 * `ETag`; clients compare `corpusRevision`.
 */
export function noStore(
  _request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
): void {
  reply.header('Cache-Control', 'no-store');
  done();
}

/** The error responses of every workspace documentation route. */
export const workspaceDocsErrorResponses = {
  401: contractRef(AuthenticationRequiredErrorResponseSchema),
  403: contractRef(AuthorizationForbiddenErrorResponseSchema),
  404: contractRef(WorkspaceDocsErrorSchema),
  409: contractRef(WorkspaceDocsErrorSchema),
  503: contractRef(WorkspaceDocsErrorSchema),
} as const;

/** Answers `code` with its status and body. */
export function replyWithDocsError<R extends FastifyReply>(
  reply: R,
  code: WorkspaceDocsErrorCode,
): R {
  // Every workspace documentation route declares these statuses (workspaceDocsErrorResponses); the
  // typed reply only knows the codes of its own route.
  (reply as FastifyReply).code(STATUS[code]).send(workspaceDocsError(code));

  return reply;
}

/** Answers a workspace whose documentation cannot be read now. */
export function replyWithWorkspaceFailure<R extends FastifyReply>(
  reply: R,
  failure: WorkspaceDocsFailure,
): R {
  if (failure.kind === 'not-configured') {
    (reply as FastifyReply)
      .code(STATUS.DOCS_NOT_CONFIGURED)
      .send({ ...workspaceDocsError('DOCS_NOT_CONFIGURED'), docsRoot: failure.docsRoot });

    return reply;
  }

  return replyWithDocsError(reply, CODES[failure.kind]);
}
