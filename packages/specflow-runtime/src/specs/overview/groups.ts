import type { SpecsOverviewGroup } from '@nevo/specflow-contracts/specs-overview';
import { integer, onlyKeys, record } from '../../config/value';
import { RuntimeConfigError } from '../../config/error';

export const defaultOverviewGroups: readonly SpecsOverviewGroup[] = [
  { id: 'requires-attention', order: 10 },
  { id: 'active', order: 20 },
  { id: 'ready', order: 30 },
  { id: 'draft', order: 40 },
];

// A configured list enables only its listed standard IDs. Semantics stay backend-owned.
export function overviewGroups(groups: readonly SpecsOverviewGroup[] = defaultOverviewGroups) {
  if (new Set(groups.map((group) => group.id)).size !== groups.length)
    throw new Error('Specs Overview group IDs must be unique.');
  return [...groups].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function parseOverviewGroups(specs: unknown): SpecsOverviewGroup[] {
  if (specs === undefined) return overviewGroups();
  const root = record(specs, 'specs');
  onlyKeys(root, new Set(['overview']), 'specs');
  if (root.overview === undefined) return overviewGroups();
  const overview = record(root.overview, 'specs.overview');
  onlyKeys(overview, new Set(['groups']), 'specs.overview');
  if (overview.groups === undefined) return overviewGroups();
  if (!Array.isArray(overview.groups))
    throw new RuntimeConfigError('specs.overview.groups must be an array.');
  const groups = overview.groups.map((value: unknown): SpecsOverviewGroup => {
    const group = record(value, 'specs.overview.groups[]');
    onlyKeys(group, new Set(['id', 'order']), 'specs.overview.groups[]');
    const id = group.id;
    if (id !== 'requires-attention' && id !== 'active' && id !== 'ready' && id !== 'draft')
      throw new RuntimeConfigError('Unknown Specs Overview group ID.');
    return { id, order: integer(group.order, 'specs.overview.groups[].order') };
  });
  if (new Set(groups.map((group) => group.id)).size !== groups.length)
    throw new RuntimeConfigError('Specs Overview group IDs must be unique.');
  return overviewGroups(groups);
}
