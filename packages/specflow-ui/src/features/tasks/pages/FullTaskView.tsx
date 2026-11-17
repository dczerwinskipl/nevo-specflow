import type { ReactNode } from 'react';
/** The Task page's reading column. The way back is the page's header Back (Narrow) or its trail. */
export function FullTaskView({ children }: { readonly children: ReactNode }) {
  return <div className="grid min-w-0 max-w-content-standard gap-4">{children}</div>;
}
