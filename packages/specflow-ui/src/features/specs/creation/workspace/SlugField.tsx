import type { MutableRefObject } from 'react';
import { Field, TextInput } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { SPEC_SLUG_MAX_LENGTH, deriveSpecSlug } from '@nevo/specflow-contracts/specs';
import { useMessage, type Message } from '../../../../i18n/message';
import { createControlWidth } from '../createFormLayout';
import type { SettingsUpdate } from './settingsTypes';
import type { WorkspaceChoice } from './model/workspaceChoice';

/**
 * The specification name (slug) of a changed "Branch name" row: it follows the title until the
 * owner types their own, and only a typed value that differs is sent.
 */
export function SlugField({
  choice,
  title,
  error,
  update,
  inputRef,
}: {
  choice: WorkspaceChoice;
  /** The specification name: the generated slug derives from it. */
  title: string;
  error: Message | undefined;
  update: SettingsUpdate;
  inputRef: MutableRefObject<HTMLInputElement | null>;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const value = choice.slug.edited ? choice.slug.value : deriveSpecSlug(title);

  return (
    <Field invalid={Boolean(error)} className={createControlWidth}>
      <Field.Label>{t('create.workspace.settings.slugLabel')}</Field.Label>
      <TextInput
        ref={inputRef}
        value={value}
        maxLength={SPEC_SLUG_MAX_LENGTH}
        placeholder={t('create.workspace.settings.slugPlaceholder')}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) =>
          update.set({ slug: { on: true, value: event.target.value, edited: true } })
        }
      />
      <Field.Description>{t('create.workspace.settings.slugDescription')}</Field.Description>
      {error && <Field.Error>{text(error)}</Field.Error>}
    </Field>
  );
}
