import { createContext, useContext } from 'react';

import { useWorkspaceCapabilities } from './useWorkspaceCapabilities';

/**
 * The layout `AppWorkspace` actually resolved for this render, for content rendered inside its
 * Primary/Secondary (workspace-dynamic-split.md "Resolved layout vs shell capability").
 *
 * - `mode` — `'split'` when Primary and Secondary sit side by side, `'stacked'` when the Secondary
 *   slides over Primary (or there is none and the workspace is narrow).
 * - `primaryScrollOwner` — who owns Primary's page-level scroll: `'ambient'` when `AppWorkspace`
 *   supplies the scroll viewport (`useWorkspacePrimaryScroll()` is non-null; stacked layout with
 *   `scroll="workspace"`), `'local'` when Primary content must own a scroll container itself (a split
 *   layout, or `scroll="content"`).
 */
export interface WorkspaceLayout {
  mode: 'split' | 'stacked';
  primaryScrollOwner: 'local' | 'ambient';
}

export const WorkspaceLayoutContext = createContext<WorkspaceLayout | null>(null);

/**
 * Primary content that adapts to the workspace's own layout (scroll owner, fixed vs sticky overlay,
 * density) reads it here rather than from `useWorkspaceCapabilities()`: with `split="dynamic"` a
 * runtime Secondary splits from 730px while `supportsSplit` (the fixed presets' threshold) switches
 * at 840px, so between the two the shell hint and the real layout disagree.
 *
 * Outside an `AppWorkspace` (no resolved layout exists) it falls back to the shell hint, so a
 * consumer never has to special-case being rendered standalone.
 */
export function useWorkspaceLayout(): WorkspaceLayout {
  const layout = useContext(WorkspaceLayoutContext);
  const { supportsSplit } = useWorkspaceCapabilities();

  if (layout) {
    return layout;
  }

  return supportsSplit
    ? { mode: 'split', primaryScrollOwner: 'local' }
    : { mode: 'stacked', primaryScrollOwner: 'ambient' };
}
