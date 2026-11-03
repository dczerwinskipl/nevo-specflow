import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  AppContent,
  AppWorkspace,
  IconButton,
  MessageComposer,
  Typography,
  WorkspaceHeader,
} from '@nevo/ui';
import { SessionNamingStatus } from './SessionNamingStatus';

/**
 * Story-only stand-in for the Session screen right after a Session was started from the New Session
 * screen: the real `WorkspaceHeader` and a Composer. The Session opens idle (provisional title, empty
 * Composer); the agent names it only from the first message sent in it, so the naming state appears
 * after that message. `ManagedSession` itself is not used because its header has no naming state yet
 * — see `SessionNamingStatus` and the hook-up in `docs/ideas/specflow-ui/screens/new-session-ui-spec.md`.
 *
 * `generatedTitle` arrives after `namingDelayMs` from the first message (the agent naming the
 * Session); `customName` skips naming entirely. A `namingDelayMs` of `null` keeps it pending.
 * `sentMessage` starts the stand-in after the first message was already sent.
 */
export function SessionLandingPreview({
  sentMessage,
  customName,
  generatedTitle,
  namingDelayMs = 900,
}: {
  sentMessage?: string;
  customName?: string;
  generatedTitle: string;
  namingDelayMs?: number | null;
}) {
  const { t } = useTranslation();
  const [sent, setSent] = useState(sentMessage);
  const [draft, setDraft] = useState('');
  const [generated, setGenerated] = useState<string | undefined>(undefined);
  // Stands in for the naming result arriving from the Runtime (an external event).
  useEffect(() => {
    if (!sent || customName || namingDelayMs === null) {
      return undefined;
    }

    const timer = setTimeout(() => setGenerated(generatedTitle), namingDelayMs);

    return () => clearTimeout(timer);
  }, [sent, customName, generatedTitle, namingDelayMs]);
  const pending = Boolean(sent) && !customName && !generated;

  return (
    <AppWorkspace scroll="workspace" fit="available">
      <AppWorkspace.Primary
        header={
          <WorkspaceHeader
            title={customName ?? generated ?? t('sessionNaming.provisionalTitle')}
            subtitle={sent ? <span role="status">{t('managedSession.busy')}</span> : undefined}
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
        <AppContent className="flex flex-col gap-4 p-4 sm:p-6">
          {sent ? (
            <div className="ml-auto grid max-w-prose gap-1">
              <Typography as="p" variant="body-md" className="whitespace-pre-wrap">
                {sent}
              </Typography>
            </div>
          ) : null}
          <div className="mt-auto">
            <label htmlFor="landing-message" className="sr-only">
              {t('managedSession.message')}
            </label>
            <MessageComposer
              presentation="standalone"
              onSubmit={(value) => {
                if (value.trim()) {
                  setSent(value.trim());
                  setDraft('');
                }
              }}
            >
              <MessageComposer.Editor
                id="landing-message"
                minRows={1}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <MessageComposer.Toolbar>
                <div className="ml-auto">
                  <IconButton
                    aria-label={t('managedSession.send')}
                    disabled={!draft.trim()}
                    icon={Send}
                    size="sm"
                    type="submit"
                    variant={draft.trim() ? 'primary' : 'secondary'}
                  />
                </div>
              </MessageComposer.Toolbar>
            </MessageComposer>
          </div>
        </AppContent>
      </AppWorkspace.Primary>
    </AppWorkspace>
  );
}
