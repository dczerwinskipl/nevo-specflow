import type { DemoCatalogue } from '../demo-catalogue';
import type { DefinitionSource } from '../tasks';
import { readTaskTargets, type AssociationTargets } from './targets';

/** Demo mode: Specification and Task facts from the demo catalogue and its Task sources. */
export function createDemoAssociationTargets(options: {
  catalogue: DemoCatalogue;
  /** Whether a catalogue Specification is in the archive collection. */
  isArchived(specId: string): Promise<boolean>;
  definitions?: DefinitionSource;
}): AssociationTargets {
  return {
    async specification(specId) {
      const record = await options.catalogue.find(specId);
      if (!record) {
        return { state: 'missing' };
      }

      return {
        state: 'available',
        value: {
          specId: record.id,
          ...(record.key ? { key: record.key } : {}),
          title: record.title,
          collection: (await options.isArchived(specId)) ? 'archived' : 'current',
        },
      };
    },
    tasks: (specId, taskIds) => readTaskTargets(options.definitions, specId, taskIds),
    workspaces: (specIds) =>
      Promise.resolve(new Map(specIds.map((specId) => [specId, 'demo-workspace']))),
  };
}
