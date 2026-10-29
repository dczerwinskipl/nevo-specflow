import { specificationWorkSections } from '../../features/specs/extensions/specificationWorkSections';
import { specificationAttentionItems } from '../../features/specs/extensions/specificationAttentionItems';
import { specsOverviewPanels } from '../../features/specs/extensions/specsOverviewPanels';
import { specsUiModule } from '../../features/specs/uiModule';
import { creationUiModule } from '../../features/specs/creation/uiModule';
import { gitUiModule } from '../../features/git/uiModule';
import { sessionsUiModule } from '../../features/sessions/uiModule';
import { tasksUiModule } from '../../features/tasks/uiModule';
import { documentsUiModule } from '../../features/documents/uiModule';
import { createUiRegistry, type UiRegistry } from './registry';
import type { UiModule } from './contracts';

/** Compose typed, feature-owned UI contributions at the application boundary. */
export function createSpecFlowUiRegistry(modules: readonly UiModule[]): UiRegistry {
  const registry = createUiRegistry(
    [specificationWorkSections, specificationAttentionItems, specsOverviewPanels],
    modules,
  );

  return registry;
}

/** Static application composition: feature modules register without registry changes. */
export const builtInUiModuleRegistry = createSpecFlowUiRegistry([
  specsUiModule,
  creationUiModule,
  gitUiModule,
  sessionsUiModule,
  tasksUiModule,
  documentsUiModule,
]);
