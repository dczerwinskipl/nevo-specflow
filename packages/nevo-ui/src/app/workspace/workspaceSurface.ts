import type { ReactNode } from 'react';
import type { WorkspaceHeaderAction } from './WorkspaceHeader';

/** Runtime workspace surface owned by a feature. Workspace chrome decides how it is presented. */
export interface AppWorkspaceSurface {
  header?: ReactNode;
  content: ReactNode;
  /** Explicit compact actions slot; the workspace never introspects a rendered header. */
  renderCompactActions?: (props: {
    navigationAction?: WorkspaceHeaderAction;
    className?: string;
  }) => ReactNode;
  /** Internal lifecycle wrapper shared by header and content. */
  wrap?: (children: ReactNode) => ReactNode;
}
