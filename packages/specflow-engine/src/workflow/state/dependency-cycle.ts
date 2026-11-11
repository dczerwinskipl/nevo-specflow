/** A Task id on a dependency cycle of the graph, or `undefined` when it has none. */
export function dependencyCycle(graph: ReadonlyMap<string, readonly string[]>): string | undefined {
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string): string | undefined => {
    const seen = state.get(id);
    if (seen !== undefined) {
      return seen === 'visiting' ? id : undefined;
    }

    state.set(id, 'visiting');
    for (const dependency of graph.get(id) ?? []) {
      const cycle = visit(dependency);
      if (cycle !== undefined) {
        return cycle;
      }
    }

    state.set(id, 'done');

    return undefined;
  };

  for (const id of graph.keys()) {
    const cycle = visit(id);
    if (cycle !== undefined) {
      return cycle;
    }
  }

  return undefined;
}
