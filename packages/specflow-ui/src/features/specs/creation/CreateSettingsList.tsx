import { Trans, useTranslation } from 'react-i18next';
import { DescriptionList } from '@nevo/ui';
import { BranchRef } from './workspace/BranchRef';
import type { CreateSettingsModel } from './createPageView';
import { WorkspaceRef } from './workspace/WorkspaceRef';
import { SummaryRow } from './workspace/WorkspaceTileSummaries';

/**
 * The compact configuration of this Create in plain language, as a description list that reuses the
 * rows and the branch/workspace references of the form's workspace summary so the wording matches:
 * type, branch, base and the workspace it is integrated into later, plus a short goal. Technical
 * values and system behaviour that is not the user's choice (folder, name slug, the commit the
 * Engine makes, operation id) live in `CreateTechnicalDetails`. The uncommitted-changes
 * caveat of the merge target belongs to the form, near the choice, and is not repeated here. Every
 * value comes from the retained request and the facts saved with the draft; a row whose value is
 * unknown is not shown.
 */
export function CreateSettingsList({ settings }: { settings: CreateSettingsModel }) {
  const { t } = useTranslation();
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
      {settings.name && (
        <SummaryRow label={t('create.page.settings.name')} override={false}>
          <span className="wrap-anywhere">{settings.name}</span>
        </SummaryRow>
      )}
      <SummaryRow label={t('create.page.settings.where')} override>
        {where}
      </SummaryRow>
      {settings.branch && (
        <SummaryRow label={t('create.workspace.fact.branch')} override={false}>
          <BranchRef name={settings.branch} />
        </SummaryRow>
      )}
      {(settings.base !== undefined || settings.baseHead === true) && (
        <SummaryRow label={t('create.workspace.fact.base')} override={false}>
          {settings.base ? <BranchRef name={settings.base} /> : t('create.workspace.baseHead')}
        </SummaryRow>
      )}
      {settings.mergeInto && (
        <SummaryRow label={t('create.workspace.fact.target')} override={false}>
          <WorkspaceRef workspace={settings.mergeInto} />
        </SummaryRow>
      )}
      {settings.goal && (
        <SummaryRow label={t('create.page.settings.goal')} override={false}>
          <span className="line-clamp-2">{settings.goal}</span>
        </SummaryRow>
      )}
    </DescriptionList>
  );
}
