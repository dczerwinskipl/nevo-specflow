import { WorkspaceHeaderIdentity } from '@nevo/ui';
import type { TaskLink } from '@nevo/specflow-contracts/specs/workspace';
import { useTranslation } from 'react-i18next';
import { DocumentContent } from '../../../documents';
import { TaskSourceState } from './TaskSourceState';

/** What a material of a history entry links to: a document is read, every other target is not. */
export function TaskReferenceInspection({ link }: { readonly link?: TaskLink }) {
  if (!link) {
    return <TaskSourceState state="unavailable" />;
  }

  if (link.state !== 'available') {
    return <TaskSourceState state={link.state} />;
  }

  const target = link.target;
  if (target.kind === 'document') {
    return (
      <DocumentContent
        specId={target.specId}
        documentId={target.documentId}
        expectedRevision={target.revision}
      />
    );
  }

  // Other resource owners have no inspection reader in this increment.
  return <TaskSourceState state="unavailable" />;
}

export function TaskResourceHeader() {
  const { t } = useTranslation();

  return <WorkspaceHeaderIdentity headingLevel={2} title={t('taskDetails.resource')} />;
}

export function TaskHistoryHeader() {
  const { t } = useTranslation();

  return (
    <WorkspaceHeaderIdentity headingLevel={2} title={t('specification.taskFullHistoryHeading')} />
  );
}
