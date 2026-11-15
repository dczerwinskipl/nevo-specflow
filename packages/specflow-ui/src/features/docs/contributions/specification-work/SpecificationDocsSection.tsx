import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { Icon, InformationList } from '@nevo/ui';
import { OperationalRow } from '../../../../shared/operational-list';
import { WorkspaceSection } from '../../../../shared/workspace-section';
import { useWorkspaces } from '../../../workspaces/read-model';
import { currentDocsWorkspace } from '../../current-workspace/currentWorkspaceStore';

/**
 * The contextual entry from a Specification: one compact row, "Documentation" with the name of
 * the workspace the Specification is bound to, after the Specification's own work, aligned with
 * the Documents rows above it. Opening it makes that workspace the tab's current one.
 */
export function SpecificationDocsSection({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const workspace = useWorkspaces().data?.workspaces.find(
    (item) => item.workspaceId === workspaceId,
  );

  return (
    <WorkspaceSection aria-label={t('docs.entry.specification.label')}>
      <InformationList>
        <OperationalRow
          primary={t('docs.entry.specification.label')}
          supporting={workspace?.name}
          // A way into the documentation, like the Session Context's rows: the chevron says so.
          trailing={<Icon name="chevron-right" size="sm" className="text-content-muted" />}
          titleAs="span"
          onPrimaryClick={() => {
            currentDocsWorkspace.enterSpecification(workspaceId);
            void navigate({ to: '/workspaces/$workspaceId/docs', params: { workspaceId } });
          }}
          dataAttributes={{ 'data-focus-key': 'specification-docs' }}
        />
      </InformationList>
    </WorkspaceSection>
  );
}
