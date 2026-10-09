import { specificationWorkSections } from '../../features/specs/extensions/specificationWorkSections';
import { tasksUiModule } from '../../features/tasks/uiModule';
import { createUiRegistry } from './registry';

/** Static application composition: adding a module does not change registry internals. */
export const builtInUiModuleRegistry = createUiRegistry(
  [specificationWorkSections],
  [tasksUiModule],
);
