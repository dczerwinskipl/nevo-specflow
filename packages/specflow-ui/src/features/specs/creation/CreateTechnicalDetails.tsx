import { Collapsible, DescriptionList, Typography } from '@nevo/ui';
import { Trans, useTranslation } from 'react-i18next';
import { BranchRef } from '../../../shared/git/BranchRef';
import type { CreateSettingsModel } from './createPageView';

const code = (value: string) => (
  <Typography as="span" variant="code-md" className="wrap-anywhere">
    {value}
  </Typography>
);

/**
 * What only matters when something needs diagnosing or finding on disk, closed by default: where
 * the new workspace folder will be (an absolute path), the specification name slug, the commit the
 * Engine makes (system behaviour, not a choice) and the operation id. It is the quiet end of the page, never part of the progress.
 */
export function CreateTechnicalDetails({
  settings,
  operationId,
}: {
  settings: CreateSettingsModel | undefined;
  operationId: string;
}) {
  const { t } = useTranslation();
  // The branch the Engine commits the scaffold to: the new branch, or the workspace's own.
  const commitBranch =
    settings?.commit === true
      ? settings.place === 'new'
        ? settings.branch
        : settings.workspace?.branch
      : undefined;
  return (
    <Collapsible className="-ml-control-padding-compact">
      <Collapsible.Trigger>{t('create.page.details.title')}</Collapsible.Trigger>
      <Collapsible.Content>
        <DescriptionList className="ml-control-padding-compact pb-2">
          {settings?.folder && (
            <DescriptionList.Item>
              <DescriptionList.Term>{t('create.workspace.fact.folder')}</DescriptionList.Term>
              <DescriptionList.Detail>{code(settings.folder)}</DescriptionList.Detail>
            </DescriptionList.Item>
          )}
          {commitBranch && (
            <DescriptionList.Item>
              <DescriptionList.Term>{t('create.workspace.fact.commit')}</DescriptionList.Term>
              <DescriptionList.Detail>
                <Trans
                  i18nKey="create.page.settings.committedTo"
                  components={{ branch: <BranchRef name={commitBranch} /> }}
                />
              </DescriptionList.Detail>
            </DescriptionList.Item>
          )}
          {settings?.slug && (
            <DescriptionList.Item>
              <DescriptionList.Term>{t('create.page.settings.slug')}</DescriptionList.Term>
              <DescriptionList.Detail>{code(settings.slug)}</DescriptionList.Detail>
            </DescriptionList.Item>
          )}
          <DescriptionList.Item>
            <DescriptionList.Term>{t('create.operation.detail.operation')}</DescriptionList.Term>
            <DescriptionList.Detail>{code(operationId)}</DescriptionList.Detail>
          </DescriptionList.Item>
        </DescriptionList>
      </Collapsible.Content>
    </Collapsible>
  );
}
