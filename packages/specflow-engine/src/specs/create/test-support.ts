import type { SpecFlowEngine } from '../../application';
import { installDefinitionsForTesting } from '../definitions/testing-install';
import { normalizeCreateClientIntent } from './intent';
import type { WindowsPathBoundOptions } from './path-bound';
import {
  createSpecificationFromRequest,
  type CreateSpecificationRequest,
  type CreateSpecificationRequestOptions,
} from './request';
import {
  createSpecificationWithIntent,
  type CreateEffectHook,
  type CreateSpecificationInput,
  type CreateSpecificationOptions,
  type CreatedSpecification,
} from './durable';

export interface TestCreateOptions extends CreateSpecificationOptions {
  readonly afterEffect?: CreateEffectHook;
  /** Judge the Windows path bound for another platform than the running one. */
  readonly windowsPathBound?: WindowsPathBoundOptions;
  /**
   * Give the Project Home the shipped definitions first when it has none (default). Pass `false` for
   * a test that needs a project without definitions.
   */
  readonly installDefinitions?: boolean;
}

/** Fault injection for real filesystem/process tests, not for Engine consumers. */
export async function createSpecificationForTesting(
  engine: SpecFlowEngine,
  input: CreateSpecificationInput,
  options: TestCreateOptions = {},
): Promise<CreatedSpecification> {
  if (options.installDefinitions !== false) {
    await installDefinitionsForTesting(engine);
  }

  return createSpecificationWithIntent(
    engine,
    input.operationId,
    normalizeCreateClientIntent(input),
    () => input.created,
    options,
    options.afterEffect,
    input.addedDocuments?.map((document) => document.content) ?? [],
    options.windowsPathBound,
  );
}

/**
 * {@link createSpecificationFromRequest} for tests: the request path of the CLI and Runtime, on a
 * project that has the shipped definitions unless `installDefinitions: false`.
 */
export async function createSpecificationFromRequestForTesting(
  engine: SpecFlowEngine,
  request: CreateSpecificationRequest,
  options: CreateSpecificationRequestOptions & { readonly installDefinitions?: boolean } = {},
): Promise<CreatedSpecification> {
  const { installDefinitions, ...requestOptions } = options;
  if (installDefinitions !== false) {
    await installDefinitionsForTesting(engine);
  }

  return createSpecificationFromRequest(engine, request, requestOptions);
}
