import type { MutableRefObject } from 'react';
import { Field, SwitchField, TextInput } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { SPEC_SLUG_MAX_LENGTH, deriveSpecSlug } from '@nevo/specflow-contracts/specs';
import { useMessage, type Message } from '../../../../i18n/message';
import type { SettingsUpdate } from './settingsTypes';
import { initialWorkspaceChoice, type WorkspaceChoice } from './model/workspaceChoice';

/** The specification name (slug) the Engine derives from the title, or the owner's own. */
export function SlugSetting({
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
    <div className="grid grid-cols-1 gap-3 py-3">
      <SwitchField
        label={t('create.workspace.settings.slugSwitch')}
        checked={choice.slug.on}
        description={t('create.workspace.settings.slugSwitchDescription')}
        onCheckedChange={(on) =>
          update.set({
            slug: on ? { on: true, value: '', edited: false } : initialWorkspaceChoice.slug,
          })
        }
      />
      {choice.slug.on && (
        <Field invalid={Boolean(error)}>
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
          {error && <Field.Error>{text(error)}</Field.Error>}
        </Field>
      )}
    </div>
  );
}
