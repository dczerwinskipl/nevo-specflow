import type { FigmaComponentDefinition } from '@nevo/figma-core/ir';

export interface ExportProfileSelection {
  id: string;
  roots: readonly string[];
}

/** Separates owner roots by IR artifact without dropping dependency definitions. */
export function selectExportProfileRoots(
  definitions: readonly FigmaComponentDefinition[],
  profile: ExportProfileSelection,
) {
  const roots = new Set(profile.roots);
  return {
    componentRoots: definitions.filter(
      (definition) =>
        roots.has(definition.component) &&
        (!definition.target || definition.target === 'component'),
    ),
    screenRoots: definitions.filter(
      (definition) =>
        roots.has(definition.component) &&
        (definition.target === 'fragment' || definition.target === 'screen'),
    ),
  };
}
