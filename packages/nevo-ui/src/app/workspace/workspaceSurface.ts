import type { ReactNode } from 'react';
import type { WorkspaceHeaderAction } from './WorkspaceHeader';

/** Runtime workspace surface owned by a feature. Workspace chrome decides how it is presented. */
export interface AppWorkspaceSurface {
  header?: ReactNode;
  /**
   * The screen's declared `detailHeader` (its identity: title, status). A split Secondary shows it
   * beside Back in the detail header row of a tab that is deeper than its root
   * (`SecondaryDetailHeaderRow`); absent when the screen declares none.
   */
  detailHeader?: ReactNode;
  content: ReactNode;
  /** Explicit compact actions slot; the workspace never introspects a rendered header. */
  renderCompactActions?: (props: {
    navigationAction?: WorkspaceHeaderAction;
    className?: string;
  }) => ReactNode;
  /** Internal lifecycle wrapper shared by header and content. */
  wrap?: (children: ReactNode) => ReactNode;
}
