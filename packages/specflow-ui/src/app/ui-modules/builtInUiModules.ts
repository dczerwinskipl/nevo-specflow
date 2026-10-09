import { tasksUiModule } from '../../features/tasks/uiModule';
import { createUiModuleRegistry } from './registry';

/** Application composition only: product views never import built-in feature implementations. */
export const builtInUiModuleRegistry = createUiModuleRegistry([tasksUiModule]);
