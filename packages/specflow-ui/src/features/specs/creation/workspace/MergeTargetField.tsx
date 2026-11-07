import type { MutableRefObject } from 'react';
import { Field } from '@nevo/ui';
import { Trans, useTranslation } from 'react-i18next';
import type { CreateOptions } from '@nevo/specflow-contracts/specs';
import { FormattedList } from '../../../../i18n/formatList';
import { useMessage, type Message } from '../../../../i18n/message';
import { LocalizedOptionPicker } from '../../../../shared/controls/LocalizedOptionPicker';
import { WorkspaceRef } from './WorkspaceRef';
import type { SettingsUpdate } from './settingsTypes';
import type { WorkspaceChoice } from './model/workspaceChoice';
import {
  noBranchLabel,
  specCountLabel,
  targetReasonText,
  targetReasonTextInline,
} from './model/workspaceCopy';

/**
 * The workspace picker of a changed "Merge into" row (the row owns the label, the change and the
 * reset), with what the choice means and which workspaces cannot be a target.
 */
export function MergeTargetField({
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

  return (
    <Field invalid={Boolean(error)}>
      <Field.Label className="sr-only">{t('create.workspace.settings.targetLabel')}</Field.Label>
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
  );
}
