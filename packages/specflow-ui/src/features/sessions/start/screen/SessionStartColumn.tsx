import { useTranslation } from 'react-i18next';
import { Alert, Button, useWorkspaceLayout } from '@nevo/ui';
import type { AgentChoice } from '../choice/agentChoice';
import type { SessionNameChoice } from '../choice/sessionName';
import { InertComposer } from '../conversation/InertComposer';
import { SessionStartConversation } from '../conversation/SessionStartConversation';
import { SessionStartForm, type SessionStartStatus } from '../form/SessionStartForm';
import type { SessionStartSource } from '../source/sessionStartSource';
import { PendingStartActions } from '../form/PendingStartActions';
import { StartFormSkeleton } from './StartFormSkeleton';

/**
 * The start screen's conversation column: the start form (a skeleton while the catalogue loads,
 * an alert when it cannot be read) and, on the split layout, the inactive Composer docked below it.
 * On a phone there is no Composer before Start: it would only take space from the form.
 */
export function SessionStartColumn({
  source,
  agent,
  onAgentChange,
  name,
  onNameChange,
  status,
  onStart,
}: {
  source: SessionStartSource;
  agent: AgentChoice;
  onAgentChange: (agent: AgentChoice) => void;
  name: SessionNameChoice;
  onNameChange: (name: SessionNameChoice) => void;
  status: SessionStartStatus;
  onStart: () => void;
}) {
  const { t } = useTranslation();
  const isSplit = useWorkspaceLayout().mode === 'split';
  const { catalogue } = source;

  return (
    <SessionStartConversation
      composer={
        isSplit ? (
          <InertComposer id="start-message" placeholder={t('sessionStart.composer.placeholder')} />
        ) : undefined
      }
    >
      {catalogue.status !== 'ready' ? (
        <div className="grid gap-6">
          {catalogue.status === 'loading' ? (
            <StartFormSkeleton />
          ) : (
            <Alert tone="attention" title={t('create.loadError')}>
              <Button onClick={catalogue.refresh}>{t('common.retry')}</Button>
            </Alert>
          )}
          {/* A kept request is resent as it was, so it stays reachable without the catalogue. */}
          {source.pending && (
            <PendingStartActions
              pending={source.pending}
              working={status === 'starting'}
              onStart={onStart}
            />
          )}
        </div>
      ) : (
        <SessionStartForm
          catalogue={catalogue.catalogue}
          agent={agent}
          onAgentChange={onAgentChange}
          name={name}
          onNameChange={onNameChange}
          status={status}
          pending={source.pending}
          notice={source.notice}
          configurationUnavailable={catalogue.configurationUnavailable}
          onRefresh={catalogue.refresh}
          onStart={onStart}
        />
      )}
      {source.extras}
    </SessionStartConversation>
  );
}
