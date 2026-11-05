import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, useWorkspaceLayout } from '@nevo/ui';
import { ComposerModePicker } from '../../managed/ComposerPresetPicker';
import { SessionReadyEmptyState } from '../../managed/empty/SessionReadyEmptyState';
import { ModelEffortPicker } from '../../managed/ModelEffortPicker';
import { InertComposer } from '../conversation/InertComposer';
import { SessionStartConversation } from '../conversation/SessionStartConversation';
import type { StartedSession } from './startedSession';

/**
 * The conversation of a Session just started here while its first snapshot loads: the ready empty
 * state and the Composer, in the very place of the real ones, with the model and mode the Session
 * was started with in disabled pickers. The real Composer replaces it as it is, so nothing moves
 * and no loading text shows (new-session-ui-spec.md, section 3(c)).
 */
export function StartedSessionPlaceholder({ started }: { started: StartedSession }) {
  const { t } = useTranslation();
  const compact = useWorkspaceLayout().mode !== 'split';
  const provider = useMemo(
    () =>
      started.modelId && started.modelTitle
        ? {
            capabilities: { modelOverride: true, effortOverride: true },
            models: [
              {
                modelId: started.modelId,
                title: started.modelTitle,
                efforts: started.effort ? [started.effort] : [],
              },
            ],
          }
        : undefined,
    [started.effort, started.modelId, started.modelTitle],
  );
  const modes = useMemo(
    () => (started.modeId ? [{ id: started.modeId, title: started.modeTitle ?? '' }] : []),
    [started.modeId, started.modeTitle],
  );

  return (
    <SessionStartConversation
      composer={
        <InertComposer
          id="managed-message"
          leading={
            <>
              <IconButton
                aria-label={t('managedSession.attach.action')}
                disabled
                icon={Plus}
                size="sm"
                variant="ghost"
              />
              <ComposerModePicker
                options={modes}
                value={started.modeId}
                onChange={() => undefined}
                disabled
                compact={compact}
              />
            </>
          }
          trailing={
            <ModelEffortPicker
              provider={provider}
              value={
                started.modelId ? { modelId: started.modelId, effort: started.effort } : undefined
              }
              onChange={() => undefined}
              disabled
              compact={compact}
            />
          }
        />
      }
    >
      <SessionReadyEmptyState
        providerId={started.providerIcon}
        providerTitle={started.providerTitle}
      />
    </SessionStartConversation>
  );
}
