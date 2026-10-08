import type { ReactNode } from 'react';

/** Runtime workspace surface owned by a feature. Workspace chrome decides how it is presented. */
export interface AppWorkspaceSurface {
  header?: ReactNode;
  content: ReactNode;
  /** Internal lifecycle wrapper shared by header and content. */
  wrap?: (children: ReactNode) => ReactNode;
}
