import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppContent, AppWorkspace, Typography, WorkspaceHeader } from '@nevo/ui';
import { SessionNamingStatus } from './SessionNamingStatus';

/**
 * Story-only stand-in for the Session screen right after a Session was started from the New Session
 * screen: the real `WorkspaceHeader` with the naming state, and the first message under it.
 * `ManagedSession` itself is not used because its header has no naming state yet — see
 * `SessionNamingStatus` and the hook-up in `docs/ideas/specflow-ui/screens/new-session-ui-spec.md`.
 *
 * `generatedTitle` arrives after `namingDelayMs` (the agent naming the Session from the first
 * message); `customName` skips naming entirely. A `namingDelayMs` of `null` keeps it pending.
 */
export function SessionLandingPreview({
  firstMessage,
  customName,
  generatedTitle,
  namingDelayMs = 900,
}: {
  firstMessage: string;
  customName?: string;
  generatedTitle: string;
  namingDelayMs?: number | null;
}) {
  const { t } = useTranslation();
  const [generated, setGenerated] = useState<string | undefined>(undefined);
  // Stands in for the naming result arriving from the Runtime (an external event).
  useEffect(() => {
    if (customName || namingDelayMs === null) {
      return undefined;
    }

    const timer = setTimeout(() => setGenerated(generatedTitle), namingDelayMs);

    return () => clearTimeout(timer);
  }, [customName, generatedTitle, namingDelayMs]);
  const pending = !customName && !generated;

  return (
    <AppWorkspace scroll="workspace" fit="available">
      <AppWorkspace.Primary
        header={
          <WorkspaceHeader
            title={customName ?? generated ?? t('sessionNaming.provisionalTitle')}
            subtitle={<span role="status">{t('managedSession.busy')}</span>}
            status={pending ? <SessionNamingStatus /> : undefined}
            labels={{ moreActions: t('common.moreActions') }}
            actions={[
              {
                id: 'context',
                label: t('sessions.context.title'),
                icon: 'panel-right',
                presentation: 'icon',
                direct: 'always',
                onPress: () => undefined,
              },
            ]}
          />
        }
      >
        <AppContent className="p-4 sm:p-6">
          <div className="ml-auto grid max-w-prose gap-1">
            <Typography as="p" variant="body-md" className="whitespace-pre-wrap">
              {firstMessage}
            </Typography>
          </div>
        </AppContent>
      </AppWorkspace.Primary>
    </AppWorkspace>
  );
}
