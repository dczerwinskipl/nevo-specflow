import {
  GitCapabilityError,
  ProjectHomeError,
  SpecificationError,
  WorkspaceRegistryError,
} from '@nevo/specflow-engine';

export type SpecsReadErrorCode =
  | 'ENGINE_UNAVAILABLE'
  | 'SPEC_WORKSPACE_UNAVAILABLE'
  | 'SPEC_MANIFEST_MISSING'
  | 'SPEC_SOURCE_UNAVAILABLE';

export class SpecsReadError extends Error {
  readonly code: SpecsReadErrorCode;

  constructor(code: SpecsReadErrorCode, message: string) {
    super(message);
    this.name = 'SpecsReadError';
    this.code = code;
  }
}

/** Failures of the canonical source (Engine, registry, Project Home, Git) that a read answers with 503. */
export function isSpecsSourceError(error: unknown): boolean {
  return (
    error instanceof SpecsReadError ||
    error instanceof SpecificationError ||
    error instanceof WorkspaceRegistryError ||
    error instanceof ProjectHomeError ||
    error instanceof GitCapabilityError
  );
}
