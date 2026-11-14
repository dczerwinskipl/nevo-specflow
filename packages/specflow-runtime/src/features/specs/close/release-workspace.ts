import type { PublicCloseSourceWorkspace } from '@nevo/specflow-engine';

/**
 * Releases what the Runtime holds open in a workspace's checkout (the documentation index), so Close
 * can delete it, notably on Windows; `end` lifts the hold once Close has returned.
 */
export type ReleaseWorkspace = (workspaceId: string) => Promise<{ end(): void }>;

/**
 * Runs `close` with the plan's source workspace released when it is a linked checkout, the only
 * kind Close removes. The source comes from the immutable Close plan, so a retry after the binding
 * moved to the primary still releases the linked checkout.
 */
export async function whileReleased<T>(
  release: ReleaseWorkspace | undefined,
  source: PublicCloseSourceWorkspace,
  close: () => Promise<T>,
): Promise<T> {
  const held =
    release === undefined || source.kind !== 'linked'
      ? undefined
      : await release(source.workspaceId);
  try {
    return await close();
  } finally {
    held?.end();
  }
}
