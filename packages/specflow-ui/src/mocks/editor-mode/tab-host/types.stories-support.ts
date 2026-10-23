import type { ReactNode } from 'react';
import type { WorkspaceHeaderAction } from '@nevo/ui';

/*
 * Architecture: tab host vs content.
 *
 *   tab-host/       GENERIC. The tab strip, open-item state (useTabHost), the 56px header with the
 *                   active tab's action slot, the `...` menu, the Opened menu, the dirty-close guard.
 *                   It knows nothing about markdown, code, split, gutters or word wrap. It only
 *                   understands the `TabContent` contract below.
 *   content-kinds/  SPECIFIC. Kind registry (md, code, image, binary), their views, the editor
 *                   (gutter, wrap, split), per-tab view state and editor preferences. It IMPLEMENTS
 *                   `TabContentProvider` and hands the host render(), actions(), dirty, label.
 *   Dependency direction: content-kinds -> tab-host (types only). tab-host never imports content-kinds;
 *   the provider is injected through props. Other hosts of the strip (Sessions: read-only previews,
 *   later diff or agent output) bring their own provider and import no editor code.
 */

/** A header or menu action of the active tab. The host knows groups, shortcuts and toggle state. */
export type TabAction = WorkspaceHeaderAction & {
  /** Menu group: `display` (toggles, on top) or, by default, `Actions` (below). Empty groups are not rendered. */
  group?: 'display';
  /** Trailing hint in the menu, for example `Ctrl+S`. */
  shortcut?: string;
  /** Toggle state: shown in the trailing slot; the leading icon always names the action. */
  checked?: boolean;
};

/** Everything the host needs from one open item. */
export interface TabContent {
  label: string;
  path: string;
  dirty: boolean;
  state?: 'ready' | 'loading' | 'missing';
  /** The tab panel body. */
  render: () => ReactNode;
  /** Actions for the header slot and the `...` menu while this tab is active. */
  actions: () => TabAction[];
  /** Resolves unsaved changes when the host asks before closing. */
  settle: (action: 'save' | 'discard') => void;
}

export type TabContentProvider = (id: string) => TabContent;
