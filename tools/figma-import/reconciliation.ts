export function reconciliationPlan(
  expectedStableIds: Iterable<string>,
  existingManagedStableIds: Iterable<string>,
) {
  const expected = new Set(expectedStableIds);
  const existing = new Set(existingManagedStableIds);
  return {
    create: [...expected].filter((stableId) => !existing.has(stableId)),
    retain: [...expected].filter((stableId) => existing.has(stableId)),
    remove: [...existing].filter((stableId) => !expected.has(stableId)),
  };
}

export interface ManagedNodeIdentity {
  stableId: string;
  managed: boolean;
  type: string;
}

export function shouldRemoveManagedNode(
  node: ManagedNodeIdentity,
  expectedStableIds: ReadonlySet<string>,
  removableTypes: ReadonlySet<string>,
): boolean {
  return (
    node.managed &&
    removableTypes.has(node.type) &&
    node.stableId.length > 0 &&
    !expectedStableIds.has(node.stableId)
  );
}
