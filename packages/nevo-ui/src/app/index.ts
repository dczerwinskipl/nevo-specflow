export {
  AppShell,
  useAppNavigation,
  type AppNavigationMode,
  type AppShellProps,
} from './shell/AppShell';
export { StandaloneShell, type StandaloneShellProps } from './shell/StandaloneShell';
export {
  AppContent,
  AppContentContainer,
  AppWorkspace,
  AppWorkspaceBody,
  AppWorkspaceHeader,
  AppWorkspaceSlots,
  WorkspaceHeader,
  type AppWorkspaceProps,
  type AppWorkspaceSlot,
  type AppWorkspaceSlotsProps,
  type WorkspaceHeaderAction,
  type WorkspaceHeaderActionTone,
  type WorkspaceHeaderProps,
} from './workspace/AppWorkspace';
export {
  AppWorkspaceProvider,
  useWorkspace,
  type WorkspaceContextValue,
  type WorkspaceSecondaryOptions,
  type WorkspaceSecondaryState,
} from './workspace/WorkspaceContext';
export type { AppWorkspaceSurface } from './workspace/workspaceSurface';
export type {
  AppWorkspaceSplitMode,
  AppWorkspaceShare,
  AppWorkspaceSplit,
} from './workspace/workspaceSizing';
export { APP_NAVIGATION_INLINE_PADDING, APP_SHELL_GAP } from './workspace/workspaceSizing';
export * from './floating';
export type {
  AppContentContainerSize,
  AppWorkspaceRegionProps,
  AppWorkspaceSecondaryRegionProps,
} from './workspace/AppWorkspace';
