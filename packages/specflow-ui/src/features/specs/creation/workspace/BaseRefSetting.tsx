import type { MutableRefObject, ReactNode } from 'react';
import { Field, SwitchField } from '@nevo/ui';
import { Trans, useTranslation } from 'react-i18next';
import type { CreateOptions } from '@nevo/specflow-contracts/specs';
import { useMessage, type Message } from '../../../../i18n/message';
import { LocalizedOptionPicker } from '../../../../shared/controls/LocalizedOptionPicker';
import { BranchRef } from './BranchRef';
import { MergeSuggestionNotice } from './MergeSuggestionNotice';
import { UnavailableReason } from './UnavailableReason';
import type { SettingsFocusRequest, SettingsUpdate } from './settingsTypes';
import type { WorkspaceChoice } from './model/workspaceChoice';
import { defaultBaseValue } from './model/workspaceTiles';

/** The base branch the new workspace starts from: a switch and, when on, the branch picker. */
export function BaseRefSetting({
  options,
  choice,
  error,
  update,
  controlRef,
  onAnnounce,
  onRequestFocus,
}: {
  options: CreateOptions;
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
  const unavailable = options.baseRefs.length === 0 && !choice.base.on;

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

  const description: ReactNode =
    options.baseRefs.length === 0 ? (
      <UnavailableReason>{t('create.workspace.settings.baseNone')}</UnavailableReason>
    ) : options.defaultBaseRef === 'HEAD' ? (
      primary?.branch ? (
        <Trans
          i18nKey="create.workspace.baseHeadOnBranch"
          components={{ branch: <BranchRef name={primary.branch} /> }}
        />
      ) : (
        t('create.workspace.baseHead')
      )
    ) : (
      <Trans
        i18nKey="create.workspace.settings.baseDefault"
        components={{ branch: <BranchRef name={options.defaultBaseRef} /> }}
      />
    );

  return (
    <div className="grid grid-cols-1 gap-3 py-3 first:pt-2">
      <SwitchField
        label={t('create.workspace.settings.baseSwitch')}
        checked={choice.base.on}
        aria-disabled={unavailable ? true : undefined}
        description={description}
        onCheckedChange={(on) => {
          if (unavailable && on) {
            return;
          }

          // On starts from the effective default (never an empty select, F-08); off restores it.
          update.set({ base: { on, ref: on ? defaultBaseValue(options) : '' } });
        }}
      />
      {choice.base.on && (
        <Field invalid={Boolean(error)}>
          <Field.Label>{t('create.workspace.fact.base')}</Field.Label>
          <LocalizedOptionPicker
            value={choice.base.ref}
            invalid={Boolean(error)}
            placeholder={t('create.workspace.settings.basePlaceholder')}
            controlRef={controlRef}
            onValueChange={(ref) => update.set({ base: { on: true, ref } })}
            items={options.baseRefs.map((item) => ({
              value: item.ref,
              textValue: item.ref,
              meta: baseRefMeta(item.ref, item.checkedOutWorkspaceId),
              label: (wraps) => <BranchRef name={item.ref} truncate={!wraps} />,
            }))}
          />
          {error && <Field.Error>{text(error)}</Field.Error>}
        </Field>
      )}
      {choice.base.on && (
        <MergeSuggestionNotice
          options={options}
          choice={choice}
          update={update}
          onAnnounce={onAnnounce}
          onRequestFocus={onRequestFocus}
        />
      )}
    </div>
  );
}
