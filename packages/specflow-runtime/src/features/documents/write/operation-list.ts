import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import {
  listDocumentOperationRows,
  listManualCommitRows,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';
import type { FastifyInstance, RawServerBase } from 'fastify';

import { requireCapabilityInAnyScope } from '../../auth';
import {
  registerOperationListRoute,
  type OperationListConfig,
  type OperationListSource,
  type OperationProgressRegistry,
  type OperationSourceRow,
} from '../../operations';

export const DOCUMENT_OPERATIONS_PATH = '/api/specs/document-operations';

/**
 * Document-change adapter of the operation list: the active document journals (disk only, no Git,
 * no control lock; settled records are never read) as source rows. The Engine's listing carries the
 * contract fields plus the source state; `staleExempt`, `unreadable` and the row `status` stay
 * behind (the list service judges by `state` and never applies the idle-interrupted rule to a
 * document change). A row carries no path.
 */
export function createDocumentOperationSource(engine: SpecFlowEngine): OperationListSource {
  return {
    kind: 'document-change',
    async list() {
      const rows: OperationSourceRow[] = [];
      for (const row of await listDocumentOperationRows(engine)) {
        rows.push({
          operationId: row.operationId,
          state: row.state,
          ...(row.code !== undefined ? { code: row.code } : {}),
          ...(row.subject
            ? { subject: { specId: row.subject.specId, slug: row.subject.slug } }
            : {}),
          ...(row.action !== undefined ? { action: row.action } : {}),
          ...(row.documentCount !== undefined ? { documentCount: row.documentCount } : {}),
          ...(row.startedAt !== undefined ? { startedAt: row.startedAt } : {}),
          updatedAt: row.updatedAt,
        });
      }
      return rows;
    },
  };
}

/**
 * Manual-commit adapter of the operation list (ADR 0018 decision 11): a manual commit that needs the
 * operator (`recovery-required`, or `committing` under an executor that is provably gone). A completed
 * or refused one is never listed. Same rules as the document-change adapter: disk only, no Git, no lock,
 * no path.
 */
export function createManualCommitOperationSource(engine: SpecFlowEngine): OperationListSource {
  return {
    kind: 'manual-commit',
    async list() {
      const rows: OperationSourceRow[] = [];
      for (const row of await listManualCommitRows(engine.context)) {
        rows.push({
          operationId: row.operationId,
          state: row.state,
          code: row.code,
          ...(row.subject ? { subject: { specId: row.subject.specId } } : {}),
          action: row.action,
          ...(row.documentCount !== undefined ? { documentCount: row.documentCount } : {}),
          ...(row.startedAt !== undefined ? { startedAt: row.startedAt } : {}),
          updatedAt: row.updatedAt,
        });
      }
      return rows;
    },
  };
}

export interface DocumentOperationListOptions {
  /** Absent Engine answers 503 OPERATIONS_UNAVAILABLE. */
  readonly engine?: SpecFlowEngine | undefined;
  readonly registry: OperationProgressRegistry;
  readonly config?: Partial<OperationListConfig>;
  readonly now?: () => Date;
}

/**
 * `GET /api/specs/document-operations`: document changes that need attention, admitted by `View` of
 * the Specification of each row (the Specifications list stays Create-only; the UI merges the two).
 */
export function registerDocumentOperationList<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
  options: DocumentOperationListOptions,
): void {
  registerOperationListRoute(app, {
    path: DOCUMENT_OPERATIONS_PATH,
    sources: options.engine
      ? [
          createDocumentOperationSource(options.engine),
          createManualCommitOperationSource(options.engine),
        ]
      : undefined,
    registry: options.registry,
    authorize: requireCapabilityInAnyScope({
      resource: SpecCapabilities,
      capability: SpecCapabilities.capabilities.View,
    }),
    // A row of a known Specification needs View of it. A row of no Specification (an unreadable
    // journal) is only shown to callers who may manage Specifications everywhere.
    canView: (authorization, row) =>
      row.subject?.specId
        ? authorization.can({
            resource: SpecCapabilities,
            capability: SpecCapabilities.capabilities.View,
            scope: { specId: row.subject.specId },
          })
        : authorization.can({
            resource: SpecCapabilities,
            capability: SpecCapabilities.capabilities.Manage,
            scope: {},
          }),
    ...(options.config ? { config: options.config } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
}
