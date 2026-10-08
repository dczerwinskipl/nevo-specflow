/**
 * Pure, framework-independent rules for an ephemeral, single-active-flow stack.
 * Async guards, focus restoration and rendering remain in AppWorkspaceProvider.
 */
export interface SecondaryFlowModel<TEntry> {
  id: number;
  scopeKey?: string | number;
  entries: readonly TEntry[];
}

export function startFlow<TEntry>(
  id: number,
  entry: TEntry,
  scopeKey?: string | number,
): SecondaryFlowModel<TEntry> {
  return { id, scopeKey, entries: [entry] };
}

export function pushEntry<TEntry>(
  flow: SecondaryFlowModel<TEntry>,
  entry: TEntry,
): SecondaryFlowModel<TEntry> {
  return { ...flow, entries: [...flow.entries, entry] };
}

export function replaceEntry<TEntry>(
  flow: SecondaryFlowModel<TEntry>,
  entry: TEntry,
): SecondaryFlowModel<TEntry> {
  return { ...flow, entries: [...flow.entries.slice(0, -1), entry] };
}

export function popEntry<TEntry>(
  flow: SecondaryFlowModel<TEntry>,
): SecondaryFlowModel<TEntry> | null {
  return flow.entries.length > 1 ? { ...flow, entries: flow.entries.slice(0, -1) } : null;
}

export function isCurrentEntry<TEntry extends { instanceKey: number }>(
  flow: SecondaryFlowModel<TEntry> | null,
  flowId: number,
  entryKey: number,
): boolean {
  return flow?.id === flowId && flow.entries.at(-1)?.instanceKey === entryKey;
}
