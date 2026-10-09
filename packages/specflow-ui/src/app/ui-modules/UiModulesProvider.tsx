import { createContext, useContext, type ReactNode } from 'react';
import { builtInUiModuleRegistry } from './builtInUiModules';
import type { UiModuleRegistry } from './registry';

/** Application root owns registration. The default preserves isolated Storybook surfaces. */
const UiModulesContext = createContext<UiModuleRegistry>(builtInUiModuleRegistry);

export interface UiModulesProviderProps {
  readonly modules: UiModuleRegistry;
  readonly children: ReactNode;
}

export function UiModulesProvider({ modules, children }: UiModulesProviderProps) {
  return <UiModulesContext.Provider value={modules}>{children}</UiModulesContext.Provider>;
}

export function useUiModules(): UiModuleRegistry {
  return useContext(UiModulesContext);
}
