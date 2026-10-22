import {
  OPERATION_JOURNAL_CORRUPT_CODE,
  specificationCreateSteps,
} from '@nevo/specflow-contracts/operations';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import { listPublicCreateOperations, type SpecFlowEngine } from '@nevo/specflow-engine';
import type { FastifyInstance, RawServerBase } from 'fastify';

import { requireCapabilityInAnyScope } from '../../auth';
import {
  registerOperationListRoute,
  type OperationListConfig,
  type OperationListSource,
  type OperationProgressRegistry,
  type OperationSourceRow,
} from '../../operations';
import { canViewSpec } from '../overview/filter-authorized-specs';

export const SPECS_OPERATIONS_PATH = '/api/specs/operations';

/**
 * Create adapter of the operation list: the Engine journals (disk only, no Git, no control lock)
 * mapped onto the public rows. Raw stages never leave the Engine listing; the step checklist is
 * rebuilt from the public vocabulary (`specificationCreateSteps`) exactly like live progress.
 */
export function createOperationSource(engine: SpecFlowEngine): OperationListSource {
  return {
    kind: 'specification-create',
    async list() {
      const rows: OperationSourceRow[] = [];
      for (const row of await listPublicCreateOperations(engine)) {
        if (row.unreadable || !row.target) {
          rows.push({
            operationId: row.operationId,
            state: 'recovery-required',
            code: OPERATION_JOURNAL_CORRUPT_CODE,
            updatedAt: row.updatedAt,
          });
          continue;
        }
        const checklist = specificationCreateSteps(row.target.kind, row.commits === true);
        const at = row.currentStep ? checklist.findIndex((step) => step === row.currentStep) : -1;
        const steps =
          row.state === 'completed'
            ? checklist.map((id) => ({ id, status: 'done' as const }))
            : at >= 0
              ? checklist.map((id, index) => ({
                  id,
                  status:
                    index < at
                      ? ('done' as const)
                      : index === at
                        ? ('running' as const)
                        : ('pending' as const),
                }))
              : undefined;
        rows.push({
          operationId: row.operationId,
          state: row.state,
          ...(row.title !== undefined ? { title: row.title } : {}),
          subject: {
            ...(row.specId ? { specId: row.specId } : {}),
            ...(row.slug ? { slug: row.slug } : {}),
          },
          target: {
            workspaceKind: row.target.kind,
            workspaceId: row.target.workspaceId,
            ...(row.target.branch ? { branch: row.target.branch } : {}),
          },
          ...(at >= 0 && row.currentStep && row.state !== 'completed'
            ? { currentStep: row.currentStep }
            : {}),
          ...(steps ? { steps } : {}),
          ...(row.startedAt ? { startedAt: row.startedAt } : {}),
          updatedAt: row.updatedAt,
        });
      }
      return rows;
    },
  };
}

export interface SpecsOperationListOptions {
  /** Absent Engine answers 503 OPERATIONS_UNAVAILABLE. */
  readonly engine?: SpecFlowEngine | undefined;
  readonly registry: OperationProgressRegistry;
  readonly config?: Partial<OperationListConfig>;
  readonly now?: () => Date;
}

/** `GET /api/specs/operations`: Create operations, admitted by spec view (see the API reference). */
export function registerSpecsOperationList<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
  options: SpecsOperationListOptions,
): void {
  registerOperationListRoute(app, {
    path: SPECS_OPERATIONS_PATH,
    sources: options.engine ? [createOperationSource(options.engine)] : undefined,
    registry: options.registry,
    authorize: requireCapabilityInAnyScope({
      resource: SpecCapabilities,
      capability: SpecCapabilities.capabilities.View,
    }),
    // A row of a known spec needs View of that spec. A row with no spec (an unreadable journal, an
    // operation not reserved yet) is only shown to callers who may create specifications.
    canView: (authorization, row) =>
      row.subject?.specId
        ? canViewSpec(authorization, row.subject.specId)
        : authorization.can({
            resource: SpecCapabilities,
            capability: SpecCapabilities.capabilities.Create,
            scope: {},
          }),
    ...(options.config ? { config: options.config } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
}
