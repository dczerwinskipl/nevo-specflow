import type { ReactNode } from 'react';
import { DocumentDraftProvider } from '../features/documents/editor/DocumentDraftProvider';
import { SessionStateProvider } from '../features/sessions/SessionStateProvider';
import { NotificationProvider } from '../shared/notifications/notifications';

/**
 * Visit-scoped (never persisted) state of the application. Every store belongs to its owning
 * feature and is separate, so updating one never re-renders readers of another.
 */
export function VisitStateProvider({ children }: { children: ReactNode }) {
  return (
    <NotificationProvider>
      <DocumentDraftProvider>
        <SessionStateProvider>{children}</SessionStateProvider>
      </DocumentDraftProvider>
    </NotificationProvider>
  );
}
