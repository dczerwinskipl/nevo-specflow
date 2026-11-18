import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  IconButton,
  InlineNote,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  TooltipProvider,
  treeRowActionClassName,
} from '@nevo/ui';
import { TreeDocumentRow, TreeLevel } from '../../../../shared/document-tree';
import { SectionAddButton } from '../SectionAddButton';
import { OPEN_UP_TO, SupportSection } from '../SupportSection';
import { useTaskDocumentTree } from '../useTaskAuthoring';
import { TaskDocumentDialog, type TaskDocumentDialogRequest } from './TaskDocumentDialog';

export interface TaskDocumentsSectionProps {
  readonly specId: string;
  readonly taskId: string;
  /** The Task's context is its own list: a new document does not join it (the dialog says so). */
  readonly ownContext: boolean;
  /** Opens a registered document in the Secondary editor (a pushed page on Narrow). */
  readonly onOpenDocument: (documentId: string) => void;
}

/** Names a collapsed section's summary spells out before "+N". */
const SUMMARY_NAMES = 2;

const fileName = (path: string) => path.split('/').at(-1) ?? path;

/**
 * Documents: `task.md` (Task content) first, then the Task's other documents, each on the shared
 * document row (glyph, file name, trailing state) as in Context and the Overview. A row opens its
 * document in the Secondary editor; `+` creates one; the row `⋯` renames or deletes it
 * (never `task.md`, which the Documents owner protects).
 */
export function TaskDocumentsSection({
  specId,
  taskId,
  ownContext,
  onOpenDocument,
}: TaskDocumentsSectionProps) {
  const { t } = useTranslation();
  const tree = useTaskDocumentTree(specId, taskId);
  const [request, setRequest] = useState<TaskDocumentDialogRequest>();
  const documents = [...(tree.data?.documents ?? [])].sort(
    (a, b) => Number(b.required) - Number(a.required),
  );
  // Adding, renaming and deleting are offered only where the Runtime does them (not in the demo).
  const organize = tree.data?.capabilities.organize === true;
  const role = (main: boolean) =>
    main ? t('taskAuthoring.documents.taskContent') : t('taskAuthoring.documents.taskDocument');
  // Collapsed: "5 · task.md, plan.md, +3".
  const names = documents.slice(0, SUMMARY_NAMES).map((document) => fileName(document.path));
  const rest = documents.length - names.length;
  const summary = `${documents.length} · ${[
    ...names,
    ...(rest > 0 ? [t('taskAuthoring.context.moreNames', { count: rest })] : []),
  ].join(', ')}`;

  return (
    <SupportSection
      id="task-documents-heading"
      title={t('taskAuthoring.section.documents')}
      taskId={taskId}
      count={tree.data ? documents.length : undefined}
      summary={summary}
      items={documents.length}
      openUpTo={OPEN_UP_TO.documents}
      holdsBlocker={documents.some((document) => !document.file)}
      actions={
        organize ? (
          <SectionAddButton
            label={t('taskAuthoring.documents.newDocument')}
            onPress={() => setRequest({ mode: 'new' })}
          />
        ) : undefined
      }
      dialogs={
        <>
          <TaskDocumentDialog
            specId={specId}
            taskId={taskId}
            request={request}
            ownContext={ownContext}
            onClose={() => setRequest(undefined)}
          />
        </>
      }
    >
      <div className="grid gap-3">
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
        {tree.data && !tree.data.capabilities.save ? (
          <InlineNote>{t('taskAuthoring.documents.readOnly')}</InlineNote>
        ) : null}
        {/* The rows' tooltips (the document's role) delay like the Overview Documents'. */}
        <TooltipProvider delayDuration={300}>
          <TreeLevel top flat labelledBy="task-documents-heading">
            {documents.map((document) => {
              const name = fileName(document.path);
              const registered = document.classification === 'registered';
              const kind = role(document.required);

              return (
                <TreeDocumentRow
                  key={document.id}
                  name={name}
                  // A registered file that is not on disk keeps its place, as in the Documents tree.
                  state={
                    document.file
                      ? undefined
                      : { text: t('taskAuthoring.documents.fileMissing'), attention: true }
                  }
                  details={[kind]}
                  spokenDetail={kind}
                  current={false}
                  {...(document.file ? { onOpen: () => onOpenDocument(document.id) } : {})}
                  focusKey={`task-document:${document.id}`}
                  menu={
                    organize && registered && !document.required && document.file ? (
                      <Menu modal={false}>
                        <MenuTrigger asChild>
                          <IconButton
                            className={treeRowActionClassName}
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
          </TreeLevel>
        </TooltipProvider>
      </div>
    </SupportSection>
  );
}
