import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  IconButton,
  InformationList,
  InlineNote,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@nevo/ui';
import { OperationalRow } from '../../../../shared/operational-list';
import { SectionAddButton } from '../SectionAddButton';
import { SupportSection } from '../SupportSection';
import { useTaskDocumentTree } from '../useTaskAuthoring';
import { TaskDocumentDialog, type TaskDocumentDialogRequest } from './TaskDocumentDialog';

export interface TaskDocumentsSectionProps {
  readonly specId: string;
  readonly taskId: string;
  readonly collapsible: boolean;
  /** Opens a registered document in the Secondary editor (a pushed page on Narrow). */
  readonly onOpenDocument: (documentId: string) => void;
}

/**
 * Documents: `task.md` (Task content) first, then the Task's other documents. A row opens its
 * document in the Secondary editor; `+` creates one; the row `⋯` renames or deletes it
 * (never `task.md`, which the Documents owner protects).
 */
export function TaskDocumentsSection({
  specId,
  taskId,
  collapsible,
  onOpenDocument,
}: TaskDocumentsSectionProps) {
  const { t } = useTranslation();
  const tree = useTaskDocumentTree(specId, taskId);
  const [request, setRequest] = useState<TaskDocumentDialogRequest>();
  const documents = [...(tree.data?.documents ?? [])].sort(
    (a, b) => Number(b.required) - Number(a.required),
  );
  const writable = tree.data?.writable === true;
  const role = (main: boolean) =>
    main ? t('taskAuthoring.documents.taskContent') : t('taskAuthoring.documents.taskDocument');

  return (
    <SupportSection
      id="task-documents-heading"
      title={t('taskAuthoring.section.documents')}
      icon="file"
      count={tree.data ? documents.length : undefined}
      collapsible={collapsible}
      actions={
        writable ? (
          <SectionAddButton
            label={t('taskAuthoring.documents.newDocument')}
            onPress={() => setRequest({ mode: 'new' })}
          />
        ) : undefined
      }
    >
      {tree.isError ? (
        <Alert
          tone="attention"
          title={t('taskAuthoring.documents.loadFailed')}
          actions={
            <Button size="sm" variant="secondary" onClick={() => void tree.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : null}
      {tree.data && !tree.data.writable ? (
        <InlineNote>{t('taskAuthoring.documents.readOnly')}</InlineNote>
      ) : null}
      <InformationList>
        {documents.map((document) => {
          const name = document.path.split('/').at(-1) ?? document.path;
          const registered = document.classification === 'registered';

          return (
            <OperationalRow
              key={document.id}
              titleAs="h3"
              primary={name}
              onPrimaryClick={document.file ? () => onOpenDocument(document.id) : undefined}
              primaryAriaLabel={t('taskAuthoring.documents.open', { name })}
              factsLayout="inline"
              compactFacts={
                document.file
                  ? [role(document.required)]
                  : [role(document.required), t('taskAuthoring.documents.fileMissing')]
              }
              trailing={
                writable && registered && !document.required && document.file ? (
                  <Menu modal={false}>
                    <MenuTrigger asChild>
                      <IconButton
                        icon="ellipsis"
                        size="sm"
                        aria-label={t('taskAuthoring.documents.actionsFor', { name })}
                      />
                    </MenuTrigger>
                    <MenuContent align="end">
                      <MenuItem
                        onSelect={() =>
                          setRequest({
                            mode: 'rename',
                            id: document.id,
                            path: document.path,
                            revision: document.file!.revision,
                          })
                        }
                      >
                        {t('taskAuthoring.documents.rename')}
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem
                        tone="danger"
                        onSelect={() =>
                          setRequest({
                            mode: 'delete',
                            id: document.id,
                            path: document.path,
                            revision: document.file!.revision,
                          })
                        }
                      >
                        {t('taskAuthoring.documents.delete')}
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                ) : undefined
              }
            />
          );
        })}
      </InformationList>
      <TaskDocumentDialog
        specId={specId}
        taskId={taskId}
        request={request}
        onClose={() => setRequest(undefined)}
      />
    </SupportSection>
  );
}
