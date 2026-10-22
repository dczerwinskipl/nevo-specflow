import { Trans, useTranslation } from 'react-i18next';
import { DescriptionList, Typography } from '@nevo/ui';
import { useMessage } from '../../../i18n/message';
import { BranchRef } from '../../../shared/git/BranchRef';
import type { CreateSettingsModel } from './createPageView';
import { WorkspaceRef } from './workspace/NewWorkspaceSettings';
import { mergeUnavailableNote } from './workspace/workspaceCopy';
import { SummaryRow } from './workspace/WorkspaceTileSummaries';

const code = (value: string) => (
  <Typography as="span" variant="code-md" className="wrap-anywhere">
    {value}
  </Typography>
);

/**
 * The actual settings of this Create in plain language, as a description list that reuses the
 * rows and the branch/workspace references of the form's workspace summary so the wording matches.
 * Every value comes from the retained request and the facts saved with the draft; a row whose
 * value is unknown is not shown.
 */
export function CreateSettingsList({ settings }: { settings: CreateSettingsModel }) {
  const { t } = useTranslation();
  const text = useMessage();
  const { place, workspace } = settings;

  const where =
    place === 'new' ? (
      t('create.page.settings.newWorkspace')
    ) : place === 'existing' ? (
      workspace ? (
        <Trans
          i18nKey="create.page.settings.addedToWorkspace"
          components={{ workspace: <WorkspaceRef workspace={workspace} /> }}
        />
      ) : (
        t('create.page.settings.addedToExistingUnknown')
      )
    ) : workspace?.branch ? (
      <Trans
        i18nKey="create.page.settings.addedToFolder"
        components={{ branch: <BranchRef name={workspace.branch} /> }}
      />
    ) : (
      t('create.page.settings.addedToFolderUnknown')
    );

  return (
    <DescriptionList aria-label={t('create.page.settings.label')}>
      <SummaryRow label={t('create.page.settings.where')} override>
        {where}
      </SummaryRow>
      {settings.branch && (
        <SummaryRow label={t('create.workspace.fact.branch')} override={false}>
          <BranchRef name={settings.branch} />
        </SummaryRow>
      )}
      {(settings.base || settings.baseHead) && (
        <SummaryRow label={t('create.workspace.fact.base')} override={false}>
          {settings.base ? <BranchRef name={settings.base} /> : t('create.workspace.baseHead')}
        </SummaryRow>
      )}
      {settings.folder && (
        <SummaryRow label={t('create.workspace.fact.folder')} override={false}>
          {code(settings.folder)}
        </SummaryRow>
      )}
      {settings.mergeInto && (
        <SummaryRow
          label={t('create.workspace.fact.target')}
          override={false}
          note={settings.mergeReason ? text(mergeUnavailableNote(settings.mergeReason)) : undefined}
        >
          <WorkspaceRef workspace={settings.mergeInto} />
        </SummaryRow>
      )}
      {settings.slug && (
        <SummaryRow label={t('create.page.settings.slug')} override={false}>
          {code(settings.slug)}
        </SummaryRow>
      )}
      {settings.goal && (
        <SummaryRow label={t('create.page.settings.goal')} override={false}>
          <span className="line-clamp-3">{settings.goal}</span>
        </SummaryRow>
      )}
    </DescriptionList>
  );
}
