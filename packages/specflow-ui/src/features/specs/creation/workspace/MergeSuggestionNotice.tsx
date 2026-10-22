import { Alert, Button, InlineNote } from '@nevo/ui';
import { Trans, useTranslation } from 'react-i18next';
import type { CreateOptions } from '@nevo/specflow-contracts/specs';
import { BranchRef } from '../../../../shared/git/BranchRef';
import { effectiveTargetBranch, mergeSuggestion } from './mergeSuggestion';
import type { SettingsFocusRequest, SettingsUpdate } from './settingsTypes';
import type { WorkspaceChoice } from './workspaceChoice';

/**
 * What the chosen base suggests about the merge target: offer the workspace that has the base
 * checked out as the target, or note that it has uncommitted changes. Nothing when there is none.
 */
export function MergeSuggestionNotice({
  options,
  choice,
  update,
  onAnnounce,
  onRequestFocus,
}: {
  options: CreateOptions;
  choice: WorkspaceChoice;
  update: SettingsUpdate;
  onAnnounce: (message: string) => void;
  onRequestFocus: SettingsFocusRequest;
}) {
  const { t } = useTranslation();
  const suggestion = mergeSuggestion(choice, options);
  const currentTarget = effectiveTargetBranch(choice, options);
  if (suggestion?.kind === 'dirty')
    return (
      <InlineNote>
        <Trans
          i18nKey="create.workspace.suggestion.dirty"
          components={{ branch: <BranchRef name={suggestion.branch} /> }}
        />
      </InlineNote>
    );
  if (suggestion?.kind !== 'offer') return null;
  return (
    <Alert
      tone="info"
      title={
        <Trans
          i18nKey="create.workspace.suggestion.title"
          components={{ branch: <BranchRef name={suggestion.branch} /> }}
        />
      }
    >
      <p>
        {currentTarget ? (
          <Trans
            i18nKey="create.workspace.suggestion.projectDefault"
            components={{ branch: <BranchRef name={currentTarget} /> }}
          />
        ) : null}
        {t('create.workspace.suggestion.note')}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            onRequestFocus('target');
            update.update((current) => ({
              ...current,
              settingsOpen: true,
              target: { on: true, workspaceId: suggestion.workspaceId },
            }));
            onAnnounce(t('create.workspace.suggestion.announceSet', { branch: suggestion.branch }));
          }}
        >
          {t('create.workspace.suggestion.set')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            onRequestFocus('base');
            update.update((current) => ({
              ...current,
              dismissedSuggestions: {
                ...current.dismissedSuggestions,
                [suggestion.workspaceId]: true,
              },
            }));
            onAnnounce(
              currentTarget
                ? t('create.workspace.suggestion.announceKept', { branch: currentTarget })
                : t('create.workspace.suggestion.announceKeptNoTarget'),
            );
          }}
        >
          {t('create.workspace.suggestion.keep')}
        </Button>
      </div>
    </Alert>
  );
}
