import type { ReactNode } from 'react';

/** Runtime workspace surface owned by a feature. Workspace chrome decides how it is presented. */
export type AppWorkspaceSurface = {
  header?: ReactNode;
  content: ReactNode;
};

