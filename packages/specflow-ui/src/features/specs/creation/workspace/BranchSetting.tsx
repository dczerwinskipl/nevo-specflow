import type { MutableRefObject } from 'react';
import { Field, SwitchField, TextInput } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { BRANCH_NAME_MAX_LENGTH, type CreateOptions } from '@nevo/specflow-contracts/specs';
import { useMessage, type Message } from '../../../../i18n/message';
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
    <div className="grid grid-cols-1 gap-3 pt-3">
      <SwitchField
        label={t('create.workspace.settings.branchSwitch')}
        checked={choice.branch.on}
        description={
          generatedProblem && !choice.branch.on ? (
            <span className="text-status-attention">{text(generatedProblem)}</span>
          ) : (
            t('create.workspace.settings.branchSwitchDescription')
          )
        }
        onCheckedChange={(on) =>
          update.set({
            branch: on ? { on: true, name: '', edited: false } : initialWorkspaceChoice.branch,
          })
        }
      />
      {choice.branch.on && (
        <Field invalid={Boolean(error)}>
          <Field.Label>{t('create.workspace.settings.branchLabel')}</Field.Label>
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
          <Field.Description>{t('create.workspace.settings.branchHelp')}</Field.Description>
          {error && <Field.Error>{text(error)}</Field.Error>}
        </Field>
      )}
    </div>
  );
}
