import type { MutableRefObject } from 'react';
import { Field, TextInput } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { BRANCH_NAME_MAX_LENGTH, type CreateOptions } from '@nevo/specflow-contracts/specs';
import { useMessage, type Message } from '../../../../i18n/message';
import { createControlWidth } from '../createFormLayout';
import { branchFieldValue } from './model/createRequest';
import type { SettingsUpdate } from './settingsTypes';
import type { WorkspaceChoice } from './model/workspaceChoice';

/**
 * The new branch of a changed "Branch name" row: prefilled with the name Nevo would build from the
 * slug, sent only once the owner typed a different one.
 */
export function BranchField({
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

  return (
    <Field invalid={Boolean(error)} className={createControlWidth}>
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
  );
}
