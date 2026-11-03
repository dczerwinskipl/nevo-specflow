import type { MutableRefObject } from 'react';
import { TextInput } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { BRANCH_NAME_MAX_LENGTH, type CreateOptions } from '@nevo/specflow-contracts/specs';
import { useMessage, type Message } from '../../../../i18n/message';
import { OwnValueSetting } from '../form/OwnValueSetting';
import { branchFieldValue } from './model/createRequest';
import type { SettingsUpdate } from './settingsTypes';
import { initialWorkspaceChoice, type WorkspaceChoice } from './model/workspaceChoice';
import { generatedBranchProblem } from './model/workspaceValidation';

/** The new branch name: the one Nevo builds from the slug, or the owner's own. */
export function BranchSetting({
  options,
  choice,
  title,
  error,
  update,
  inputRef,
}: {
  options: CreateOptions;
  choice: WorkspaceChoice;
  title: string;
  error: Message | undefined;
  update: SettingsUpdate;
  inputRef: MutableRefObject<HTMLInputElement | null>;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  // The generated branch is one the Engine will not commit on: the owner has to type another name.
  const generatedProblem = generatedBranchProblem(choice, options, title);

  return (
    <OwnValueSetting
      className="grid grid-cols-1 gap-3 pt-3"
      switchLabel={t('create.workspace.settings.branchSwitch')}
      on={choice.branch.on}
      switchDescription={
        generatedProblem && !choice.branch.on ? (
          <span className="text-status-attention">{text(generatedProblem)}</span>
        ) : (
          t('create.workspace.settings.branchSwitchDescription')
        )
      }
      onOnChange={(on) =>
        update.set({
          branch: on ? { on: true, name: '', edited: false } : initialWorkspaceChoice.branch,
        })
      }
      fieldLabel={t('create.workspace.settings.branchLabel')}
      fieldDescription={t('create.workspace.settings.branchHelp')}
      error={error ? text(error) : undefined}
    >
      <TextInput
        ref={inputRef}
        value={branchFieldValue(choice, options, title)}
        maxLength={BRANCH_NAME_MAX_LENGTH}
        placeholder={t('create.workspace.settings.branchPlaceholder')}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) =>
          update.set({ branch: { on: true, name: event.target.value, edited: true } })
        }
      />
    </OwnValueSetting>
  );
}
