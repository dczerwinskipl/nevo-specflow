import { createContext, useContext } from 'react';

/**
 * Whether the workspace shows the active screen's `detailHeader` itself, in the detail header row
 * beside Back (a split Secondary with root tabs, one or more levels deep, `localNavigation:
 * 'back'`). A screen that declares a `detailHeader` renders the same identity in its own content
 * whenever this is false (stacked layouts, breadcrumbs, a layout without tabs), so it is shown
 * exactly once in every layout.
 */
export const SecondaryDetailHeaderHostContext = createContext(false);

export function useSecondaryDetailHeaderHosted() {
  return useContext(SecondaryDetailHeaderHostContext);
}
