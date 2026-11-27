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
import type { CreateFirstStep } from './first-step';

export const SPECS_OPERATIONS_PATH = '/api/specs/operations';

/**
 * Create adapter of the operation list: the Engine journals (disk only, no Git, no control lock)
 * mapped onto the public rows. Raw stages never leave the Engine listing; the step checklist is
 * rebuilt from the public vocabulary (`specificationCreateSteps`) exactly like live progress.
 */
export function createOperationSource(
  engine: SpecFlowEngine,
  firstStep?: Pick<CreateFirstStep, 'read'>,
): OperationListSource {
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

        // A Create with a first-step intent ends with its agent start: until that is settled the
        // operation is still running, on `starting-agent`.
        const intent = await firstStep?.read(row.operationId).catch(() => undefined);
        const checklist = specificationCreateSteps(
          row.target.kind,
          row.commits === true,
          intent !== undefined,
        );
        const startingAgent = row.state === 'completed' && intent !== undefined && !intent.result;
        const state = startingAgent ? 'in-progress' : row.state;
        const currentStep = startingAgent ? 'starting-agent' : row.currentStep;
        const at = currentStep ? checklist.findIndex((step) => step === currentStep) : -1;
        const steps =
          state === 'completed'
            ? checklist.map((id) => ({
                id,
                status:
                  id === 'starting-agent' && intent?.result?.status === 'not-started'
                    ? ('skipped' as const)
                    : ('done' as const),
              }))
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
          state,
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
          ...(at >= 0 && currentStep && state !== 'completed' ? { currentStep } : {}),
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
  /** The first-step intents of Creates (their agent start is part of the operation). */
  readonly firstStep?: Pick<CreateFirstStep, 'read'> | undefined;
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
    summary: 'List Specification operations',
    description:
      "Read-only list of the feature's background operations; the request/inspection for each operation remains authoritative. Caller must have spec.view in some scope; each identified Specification row is independently filtered by spec.view at its trusted scope, and rows without a known Specification require spec.create. Counts are computed after authorization and before status/limit filters; no paths, journal internals or server text are exposed. The list does not run Git or acquire the Engine control lock. The weak ETag ignores generatedAt; an unchanged list answers 304. 400 OPERATION_LIST_QUERY_INVALID rejects invalid status or limit; 503 OPERATIONS_UNAVAILABLE means no Engine or failed source.",
    sources: options.engine
      ? [createOperationSource(options.engine, options.firstStep)]
      : undefined,
    registry: options.registry,
    authorize: requireCapabilityInAnyScope({
      resource: SpecCapabilities,
      capability: SpecCapabilities.capabilities.View,
    }),
    // A row of a known spec needs View of that spec. A row with no spec (an unreadable journal, an
    // operation not reserved yet) is only shown to callers who may create specifications.
    canView: (authorization, row) =>
      row.subject?.specId
        ? canViewSpec(authorization, options.engine?.context.project.projectId, row.subject.specId)
        : authorization.can({
            resource: SpecCapabilities,
            capability: SpecCapabilities.capabilities.Create,
            scope: {},
          }),
    ...(options.config ? { config: options.config } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
}
