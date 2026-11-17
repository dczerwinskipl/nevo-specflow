import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { InformationList, Typography } from '@nevo/ui';
import {
  CollectionRow,
  CollectionSupportingLine,
  SemanticSupportingLine,
  collectionPrimaryLink,
} from '../../../shared/operational-list';
import { taskRequiresAttention } from '../read-model';
import type { TaskListRowView } from './taskListModel';
import { taskRowAttention, taskRowLines } from './taskRowLine';

export interface TaskRowProps {
  readonly row: TaskListRowView;
  readonly fullTaskHref: string;
  readonly onOpen: (taskId: string) => void;
  /** The Specification's title, for "<specification> cannot continue until it moves". */
  readonly specificationTitle?: string;
}

/**
 * The Task row, on the collection's `task` tracks (`CollectionRow`): the Task cell (the title as
 * the row's link, then the mono id · Task Type) and the Status cell (the status mark and label,
 * then one supporting line: the attention overlay the Engine reports, else the hold reason or the
 * dependencies). Below 48rem of collection width it stacks in that order. The title is a real link
 * to the Full Task (a new window from the browser's own link menu). No row menu and no selection.
 */
export function TaskRow({ row, fullTaskHref, onOpen, specificationTitle }: TaskRowProps) {
  const { t } = useTranslation();
  const lines = taskRowLines(row, t, specificationTitle);
  const supporting = lines.supporting;

  return (
    <InformationList.Item
      interactive
      className="py-3"
      data-row-task={row.id}
      data-task-status={row.statusId}
      {...(taskRequiresAttention(taskRowAttention(row)) ? { 'data-task-attention': 'true' } : {})}
    >
      <InformationList.Content>
        <CollectionRow tracks="task">
          <div className="min-w-0">
            <Typography as="h3" variant="title-sm" className="min-w-0 text-content-primary">
              <a
                href={fullTaskHref}
                className={collectionPrimaryLink}
                data-focus-ring="delegated"
                onClick={(event: MouseEvent) => {
                  // A modified click keeps the browser's own behaviour (a new tab or window).
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
                    return;
                  }

                  event.preventDefault();
                  onOpen(row.id);
                }}
              >
                {row.title ?? row.id}
              </a>
            </Typography>
            <Typography
              as="div"
              variant="body-sm"
              className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 text-content-secondary"
              data-task-identity
            >
              <span className="font-mono [overflow-wrap:anywhere]">{row.id}</span>
              {row.typeTitle ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{row.typeTitle}</span>
                </>
              ) : null}
            </Typography>
          </div>
          <div className="grid min-w-0 content-start gap-1" data-task-status-cell>
            <Typography as="div" variant="body-sm" className="min-w-0">
              <SemanticSupportingLine line={lines.status} />
            </Typography>
            {supporting?.kind === 'overlay' ? (
              <Typography as="p" variant="body-sm" className="min-w-0" data-task-overlay>
                <SemanticSupportingLine
                  line={{
                    text: supporting.overlay.text,
                    icon: supporting.overlay.icon,
                    tone: supporting.overlay.tone,
                  }}
                  clamp
                />
              </Typography>
            ) : supporting?.kind === 'text' ? (
              <CollectionSupportingLine>{supporting.text}</CollectionSupportingLine>
            ) : null}
          </div>
        </CollectionRow>
      </InformationList.Content>
    </InformationList.Item>
  );
}
