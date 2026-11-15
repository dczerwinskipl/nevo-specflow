import type { MutableRefObject } from 'react';
import { Field } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { refDisplayName } from '@nevo/specflow-contracts/specs';
import type { CreateOptionsView } from './model/createOptionsView';
import { useMessage, type Message } from '../../../../i18n/message';
import { LocalizedOptionPicker } from '../../../../shared/controls/LocalizedOptionPicker';
import { BranchRef } from './BranchRef';
import { MergeSuggestionNotice } from './MergeSuggestionNotice';
import type { SettingsFocusRequest, SettingsUpdate } from './settingsTypes';
import type { WorkspaceChoice } from './model/workspaceChoice';

/**
 * The branch picker of a changed "Start from" row (the row owns the label, the change and the
 * reset) and the merge-back suggestion that choosing another branch can raise.
 */
export function BaseRefField({
  options,
  choice,
  error,
  update,
  controlRef,
  onAnnounce,
  onRequestFocus,
}: {
  options: CreateOptionsView;
  choice: WorkspaceChoice;
  error: Message | undefined;
  update: SettingsUpdate;
  controlRef: MutableRefObject<HTMLElement | null>;
  onAnnounce: (message: string) => void;
  onRequestFocus: SettingsFocusRequest;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const primary = options.workspaces.find((w) => w.workspaceId === options.primaryWorkspaceId);

  const baseRefMeta = (ref: string, checkedOutWorkspaceId?: string) => {
    if (!checkedOutWorkspaceId || !ref) {
      return undefined;
    }

    const workspace = options.workspaces.find((w) => w.workspaceId === checkedOutWorkspaceId);
    const label =
      checkedOutWorkspaceId === primary?.workspaceId
        ? t('create.workspace.settings.refCurrent')
        : t('create.workspace.settings.refWorkspace');

    return workspace?.state === 'dirty'
      ? t('create.workspace.settings.refDirty', { label })
      : label;
  };

  return (
    <div className="grid min-w-0 gap-3">
      <Field invalid={Boolean(error)}>
        <Field.Label className="sr-only">{t('create.workspace.fact.base')}</Field.Label>
        <LocalizedOptionPicker
          value={choice.base.ref}
          invalid={Boolean(error)}
          placeholder={t('create.workspace.settings.basePlaceholder')}
          controlRef={controlRef}
          onValueChange={(ref) => update.set({ base: { on: true, ref } })}
          items={options.baseRefs.map((item) => ({
            value: item.ref,
            // The value is the full ref the request sends; people see the branch name.
            textValue: refDisplayName(item.ref),
            meta: baseRefMeta(item.ref, item.checkedOutWorkspaceId),
            label: (wraps) => <BranchRef name={refDisplayName(item.ref)} truncate={!wraps} />,
          }))}
        />
        {error && <Field.Error>{text(error)}</Field.Error>}
      </Field>
      <MergeSuggestionNotice
        options={options}
        choice={choice}
        update={update}
        onAnnounce={onAnnounce}
        onRequestFocus={onRequestFocus}
      />
    </div>
  );
}
