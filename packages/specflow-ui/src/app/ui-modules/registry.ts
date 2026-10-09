import type {
  SpecFlowUiModule,
  SpecificationWorkSectionContribution,
  SpecificationWorkSlot,
} from './contracts';

export interface UiModuleRegistry {
  specificationWorkSections(
    slot: SpecificationWorkSlot,
  ): readonly SpecificationWorkSectionContribution[];
}

/** All collisions are rejected before a screen is rendered. Registration order is stable. */
export function createUiModuleRegistry(modules: readonly SpecFlowUiModule[]): UiModuleRegistry {
  const moduleIds = new Set<string>();
  const contributionIds = new Set<string>();
  const contributions: SpecificationWorkSectionContribution[] = [];

  for (const module of modules) {
    if (!module.id || moduleIds.has(module.id)) {
      throw new Error(`Duplicate or empty SpecFlow UI module id: ${module.id}`);
    }
    moduleIds.add(module.id);

    for (const contribution of module.contributions) {
      if (!contribution.id || contributionIds.has(contribution.id)) {
        throw new Error(`Duplicate or empty UI contribution id: ${contribution.id}`);
      }
      if (contribution.extensionPoint !== 'specification.work.sections') {
        throw new Error(`Unsupported UI extension point: ${String(contribution.extensionPoint)}`);
      }
      if (contribution.slot !== 'main' && contribution.slot !== 'related') {
        throw new Error(`Unsupported Specification Work slot: ${String(contribution.slot)}`);
      }
      contributionIds.add(contribution.id);
      contributions.push(contribution);
    }
  }

  return {
    specificationWorkSections: (slot) =>
      contributions.filter((contribution) => contribution.slot === slot),
  };
}
