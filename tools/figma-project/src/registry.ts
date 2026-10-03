import type { FigmaComponentDefinition } from '@nevo/figma-core/ir';
import { compileDesignDefinition } from '@nevo/figma-core/authoring';
import { projectDesignSystem, projectFigmaExportProfiles } from './project/designSystem';
import type { DesignStoryExport, CaptureSection } from './types';

const storyModules = import.meta.glob<Record<string, unknown>>(
  [
    '../../../packages/nevo-ui/src/**/*.stories.tsx',
    '../../../apps/specflow-ui/src/**/*.stories.tsx',
    '../../../examples/**/*.stories.tsx',
  ],
  { eager: true },
);

function isDesignSpec(value: unknown): value is FigmaComponentDefinition {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<FigmaComponentDefinition>;
  return (
    typeof candidate.component === 'string' &&
    Array.isArray(candidate.variantProperties) &&
    typeof candidate.slots === 'object'
  );
}

export const designSpecs = [...projectDesignSystem]
  .filter(isDesignSpec)
  .map(compileDesignDefinition)
  .sort((left, right) => left.order - right.order);

export const exportProfiles = projectFigmaExportProfiles.map((profile) => ({
  ...profile,
  roots: [...profile.roots],
}));

export function validateExportProfiles(
  profiles: readonly { id: string; roots: readonly string[] }[],
  definitions: readonly Pick<FigmaComponentDefinition, 'component'>[],
) {
  const definitionIds = new Set(definitions.map((definition) => definition.component));
  const profileIds = new Set<string>();
  const rootOwners = new Map<string, string>();
  for (const profile of profiles) {
    if (profileIds.has(profile.id))
      throw new Error(`Duplicate Figma export profile: ${profile.id}`);
    profileIds.add(profile.id);
    for (const root of profile.roots) {
      if (!definitionIds.has(root)) {
        throw new Error(`Figma export profile ${profile.id} references unknown root ${root}`);
      }
      const previousOwner = rootOwners.get(root);
      if (previousOwner) {
        throw new Error(
          `Figma export root ${root} is owned by both ${previousOwner} and ${profile.id}`,
        );
      }
      rootOwners.set(root, profile.id);
    }
  }
}

validateExportProfiles(exportProfiles, designSpecs);

export function collectCaptureSections(
  modules: Record<string, Record<string, unknown>>,
  roots?: ReadonlySet<string>,
): CaptureSection[] {
  return (
    Object.values(modules)
      .flatMap((module) => Object.values(module))
      .flatMap((value): CaptureSection[] => {
        const story = value as DesignStoryExport;
        const designCapture = story?.parameters?.designCapture;
        return designCapture && story.render ? [{ ...designCapture, render: story.render }] : [];
      })
      // Primitive capture fixtures materialize canonical resources used by every
      // profile. They remain capture inputs, while profile roots alone determine
      // component/screen ownership in emitted IR.
      .filter((section) => !roots || section.kind === 'primitive' || roots.has(section.component))
      .sort((left, right) => left.order - right.order)
  );
}

const exportRoots = new Set(exportProfiles.flatMap((profile) => profile.roots));
export const captureSections = collectCaptureSections(storyModules, exportRoots);
