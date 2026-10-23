import type { MutableRefObject, ReactNode } from 'react';
import { Field, SwitchField } from '@nevo/ui';
import { Trans, useTranslation } from 'react-i18next';
import type { CreateOptions } from '@nevo/specflow-contracts/specs';
import { FormattedList } from '../../../../i18n/formatList';
import { useMessage, type Message } from '../../../../i18n/message';
import { LocalizedOptionPicker } from '../../../../shared/controls/LocalizedOptionPicker';
import { BranchRef } from './BranchRef';
import { UnavailableReason } from './UnavailableReason';
import { WorkspaceRef } from './WorkspaceRef';
import type { SettingsUpdate } from './settingsTypes';
import type { WorkspaceChoice } from './model/workspaceChoice';
import {
  noBranchLabel,
  specCountLabel,
  targetReasonText,
  targetReasonTextInline,
} from './model/workspaceCopy';
import { defaultTargetWorkspaceId } from './model/workspaceTiles';

/** The workspace the changes return to later: a switch and, when on, the workspace picker. */
export function MergeTargetSetting({
  options,
  choice,
  error,
  update,
  controlRef,
}: {
  options: CreateOptions;
  choice: WorkspaceChoice;
  error: Message | undefined;
  update: SettingsUpdate;
  controlRef: MutableRefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const targets = options.workspaces;
  const unavailableTargets = targets.filter((w) => w.integrationSelectable !== true);
  const noTargets = targets.every((w) => w.integrationSelectable !== true);
  const unavailable = noTargets && !choice.target.on;

  const description: ReactNode = choice.target.on ? (
    t('create.workspace.settings.targetPick')
  ) : noTargets ? (
    <UnavailableReason>{t('create.workspace.settings.targetNone')}</UnavailableReason>
  ) : options.integrationTargetBranch ? (
    <Trans
      i18nKey="create.workspace.settings.targetFollows"
      components={{ branch: <BranchRef name={options.integrationTargetBranch} /> }}
    />
  ) : (
    t('create.workspace.settings.targetUnconfigured')
  );

  return (
    <div className="grid grid-cols-1 gap-3 py-3">
      <SwitchField
        label={t('create.workspace.settings.targetSwitch')}
        checked={choice.target.on}
        aria-disabled={unavailable ? true : undefined}
        description={description}
        onCheckedChange={(on) => {
          if (unavailable && on) return;
          // On starts from the default target workspace; it is sent only once it differs.
          update.set({ target: { on, workspaceId: on ? defaultTargetWorkspaceId(options) : '' } });
        }}
      />
      {choice.target.on && (
        <Field invalid={Boolean(error)}>
          <Field.Label>{t('create.workspace.settings.targetLabel')}</Field.Label>
          <LocalizedOptionPicker
            value={choice.target.workspaceId}
            invalid={Boolean(error)}
            placeholder={t('create.workspace.existing.placeholder')}
            controlRef={controlRef}
            onValueChange={(workspaceId) => update.set({ target: { on: true, workspaceId } })}
            items={targets.map((workspace) => {
              const blocked = workspace.integrationSelectable !== true;
              return {
                value: workspace.workspaceId,
                textValue: `${workspace.name} ${workspace.branch ?? text(noBranchLabel)}`,
                unavailable: blocked,
                description: blocked ? text(targetReasonText(workspace.reason)) : undefined,
                meta: text(specCountLabel(workspace.specCount)),
                label: (wraps) => <WorkspaceRef workspace={workspace} truncate={!wraps} />,
              };
            })}
          />
          <Field.Description>
            {t('create.workspace.settings.targetNote')}
            {unavailableTargets.length > 0 && (
              <span className="mt-1 block">
                <Trans
                  i18nKey="create.workspace.settings.targetUnavailable"
                  components={{
                    targets: (
                      <FormattedList
                        items={unavailableTargets.map((workspace) => (
                          <span key={workspace.workspaceId}>
                            <WorkspaceRef workspace={workspace} />{' '}
                            {t('create.workspace.settings.unavailableReason', {
                              reason: text(targetReasonTextInline(workspace.reason)),
                            })}
                          </span>
                        ))}
                      />
                    ),
                  }}
                />
              </span>
            )}
          </Field.Description>
          {error && <Field.Error>{text(error)}</Field.Error>}
        </Field>
      )}
    </div>
  );
}
