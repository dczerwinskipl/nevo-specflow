import { specificationWorkSections } from '../../features/specs/extensions/specificationWorkSections';
import {
  assertUniqueSpecificationViews,
  specificationViews,
} from '../../features/specs/extensions/specificationViews';
import { specificationAttentionItems } from '../../features/specs/extensions/specificationAttentionItems';
import { gitUiModule } from '../../features/git/uiModule';
import { sessionsUiModule } from '../../features/sessions/uiModule';
import { tasksUiModule } from '../../features/tasks/uiModule';
import { documentsUiModule } from '../../features/documents/uiModule';
import { createUiRegistry, type UiRegistry } from './registry';
import type { UiModule } from './contracts';

/** Application composition validates the Specification host's view identities. */
export function createSpecFlowUiRegistry(modules: readonly UiModule[]): UiRegistry {
  const registry = createUiRegistry(
    [specificationWorkSections, specificationViews, specificationAttentionItems],
    modules,
  );
  assertUniqueSpecificationViews(registry);
  return registry;
}

/** Static application composition: feature modules register without registry changes. */
export const builtInUiModuleRegistry = createSpecFlowUiRegistry([
  gitUiModule,
  sessionsUiModule,
  tasksUiModule,
  documentsUiModule,
]);
