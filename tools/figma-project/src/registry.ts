import type { FigmaComponentDefinition } from '@nevo/figma-core/ir';
import { compileDesignDefinition } from '@nevo/figma-core/authoring';
import { projectDesignSystem } from './project/designSystem';
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

export function collectCaptureSections(
  modules: Record<string, Record<string, unknown>>,
): CaptureSection[] {
  return Object.values(modules)
    .flatMap((module) => Object.values(module))
    .flatMap((value): CaptureSection[] => {
      const story = value as DesignStoryExport;
      const designCapture = story?.parameters?.designCapture;
      return designCapture && story.render ? [{ ...designCapture, render: story.render }] : [];
    })
    .sort((left, right) => left.order - right.order);
}

export const captureSections = collectCaptureSections(storyModules);
