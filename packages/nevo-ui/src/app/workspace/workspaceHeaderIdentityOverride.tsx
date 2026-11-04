import { createContext, useContext, type ReactNode } from 'react';

/**
 * Replaces the identity area (the title of `WorkspaceHeader`, the `content` of
 * `WorkspaceHeaderFrame`) of every workspace header rendered beneath it, leaving the header's own
 * actions, menu and labels untouched. `AppWorkspace`'s Secondary root-tab strip provides it around
 * a surface's own header, so a runtime screen's `HeaderOutlet` (which reads its actions from the
 * screen data while it renders) keeps them under the strip, in every state it renders.
 */
const WorkspaceHeaderIdentityOverrideContext = createContext<ReactNode>(null);

export const WorkspaceHeaderIdentityOverrideProvider =
  WorkspaceHeaderIdentityOverrideContext.Provider;

/** The identity override in effect, or `null` when the header renders its own identity. */
export function useWorkspaceHeaderIdentityOverride(): ReactNode {
  return useContext(WorkspaceHeaderIdentityOverrideContext);
}
