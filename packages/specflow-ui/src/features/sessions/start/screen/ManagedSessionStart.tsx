import { AppWorkspaceProvider } from '@nevo/ui';
import type { ManagedSessionsApi } from '../../managed/api';
import { useManagedStartSource } from '../source/useManagedStartSource';
import { SessionStartScreen } from './SessionStartScreen';

/**
 * The managed Runtime's own start (`/sessions/new`, no Specification): its provider catalogue and
 * request retention behind the same Session screen and form. `onOpenSession` replaces the screen
 * with the created Session.
 */
export function ManagedSessionStart({
  owner,
  api,
  onOpenSession,
}: {
  owner: string;
  api: ManagedSessionsApi;
  onOpenSession: (sessionId: string) => void;
}) {
  const source = useManagedStartSource(owner, api);

  return (
    <AppWorkspaceProvider>
      <SessionStartScreen source={source} onOpenSession={onOpenSession} />
    </AppWorkspaceProvider>
  );
}
