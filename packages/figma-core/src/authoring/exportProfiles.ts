import type { ComponentId, AnyComponentAuthoringDefinition } from './definitions';

export interface FigmaExportProfile<Root extends string = string> {
  id: string;
  owner: string;
  displayName: string;
  roots: readonly Root[];
  resources: 'owned' | 'dependencies';
}

export function defineFigmaExportProfile<
  const Definitions extends readonly AnyComponentAuthoringDefinition[],
  const Roots extends readonly ComponentId<Definitions>[],
>(
  _definitions: Definitions,
  profile: Omit<FigmaExportProfile<ComponentId<Definitions>>, 'roots'> & { roots: Roots },
) {
  return profile;
}
