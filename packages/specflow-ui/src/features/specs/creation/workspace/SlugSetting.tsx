import type { MutableRefObject } from 'react';
import { TextInput } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { SPEC_SLUG_MAX_LENGTH, deriveSpecSlug } from '@nevo/specflow-contracts/specs';
import { OwnValueSetting } from '../../../../shared/controls/OwnValueSetting';
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
    <OwnValueSetting
      className="grid grid-cols-1 gap-3 py-3"
      switchLabel={t('create.workspace.settings.slugSwitch')}
      on={choice.slug.on}
      switchDescription={t('create.workspace.settings.slugSwitchDescription')}
      onOnChange={(on) =>
        update.set({
          slug: on ? { on: true, value: '', edited: false } : initialWorkspaceChoice.slug,
        })
      }
      fieldLabel={t('create.workspace.settings.slugLabel')}
      error={error ? text(error) : undefined}
    >
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
    </OwnValueSetting>
  );
}
