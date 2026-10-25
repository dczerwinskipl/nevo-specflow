import type { SpecFlowEngine } from '../../application';
import { normalizeCreateClientIntent } from './intent';
import type { WindowsPathBoundOptions } from './path-bound';
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
}

/** Fault injection for real filesystem/process tests, not for Engine consumers. */
export function createSpecificationForTesting(
  engine: SpecFlowEngine,
  input: CreateSpecificationInput,
  options: TestCreateOptions = {},
): Promise<CreatedSpecification> {
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
