// Nevo SpecFlow Runtime application capability.
//
// BOOTSTRAP ONLY. This proves the product boundary:
//
//   installed nevo-specflow -> CLI shell -> Runtime CLI adapter
//     -> THIS capability -> deterministic marker
//
// The real long-lived Runtime (HTTP/realtime transports, provider processes,
// persistence, recovery, UI hosting, etc.) is not migrated yet. This module is
// framework-independent and knows nothing about Commander, argv, stdout, or exit codes.

export const RUNTIME_BOOTSTRAP_MARKER = 'Nevo SpecFlow runtime bootstrap is available.';

export interface RuntimeStartResult {
  readonly kind: 'bootstrap';
  readonly message: string;
}

/** Start the Runtime capability. Bootstrap-only until the real Runtime is migrated. */
export function startRuntime(): RuntimeStartResult {
  return { kind: 'bootstrap', message: RUNTIME_BOOTSTRAP_MARKER };
}
