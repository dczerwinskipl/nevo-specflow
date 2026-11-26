import { useState, type ReactNode } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Collapsible, Icon, Typography, type IconGlyph } from '@nevo/ui';
import type { AgentAttemptChanges } from '@nevo/specflow-contracts/workflow';
import { InlineAction } from '../InlineAction';
import { productIcons } from '../../../../shared/product-icons';

/** A Task list opens with this many titles; the rest wait behind "N more tasks". */
const TASKS_SHOWN = 4;

/**
 * A changed path as people find it: its file name, and the folder it is in relative to the
 * Specification's folder (or to the checkout, for a file outside it). Never the repeated
 * `specs/active/<slug>/` prefix.
 */
export function pathParts(
  path: string,
  directory: string | undefined,
): { readonly name: string; readonly folder?: string } {
  const relative =
    directory !== undefined && path.startsWith(directory + '/')
      ? path.slice(directory.length + 1)
      : path;
  const cut = relative.lastIndexOf('/');

  return cut < 0
    ? { name: relative }
    : { name: relative.slice(cut + 1), folder: relative.slice(0, cut) };
}

/** One changed path: the file name, then its folder in the muted tone. */
function PathLine({
  path,
  directory,
  onOpen,
}: {
  readonly path: string;
  readonly directory: string | undefined;
  readonly onOpen?: (() => void) | undefined;
}) {
  const { name, folder } = pathParts(path, directory);

  return (
    <li className="flex min-h-6 min-w-0 items-center gap-2" title={path}>
      {onOpen ? (
        <InlineAction
          className="inline-flex min-h-6 max-w-full shrink-0 items-center [overflow-wrap:anywhere]"
          onClick={onOpen}
        >
          {name}
        </InlineAction>
      ) : (
        <span className="max-w-full shrink-0 text-content-primary [overflow-wrap:anywhere]">
          {name}
        </span>
      )}
      {folder ? (
        <span className="min-w-0 truncate text-content-muted" data-path-folder="">
          {folder}
        </span>
      ) : null}
    </li>
  );
}

/** A Task the attempt produced, by its title: its Full Task page where a router exists. */
function TaskTitleLink({
  specId,
  task,
}: {
  readonly specId: string;
  readonly task: { readonly id: string; readonly title: string };
}) {
  const router = useRouter({ warn: false });
  const title = task.title || task.id;
  if (!router) {
    return <span className="text-content-primary">{title}</span>;
  }

  return (
    <Link
      to="/specs/$specId/tasks/$taskId"
      params={{ specId, taskId: task.id }}
      search={{ collection: 'current' }}
      className="inline-flex min-h-6 items-center text-content-link underline-offset-2 hover:underline"
    >
      {title}
    </Link>
  );
}

/**
 * One change summary row: its icon and count, collapsed by default; the list opens under it. The
 * DS disclosure without its leading chevron: the category icon leads, the chevron trails.
 */
function ChangeRow({
  icon,
  label,
  kind,
  children,
}: {
  readonly icon: IconGlyph;
  readonly label: string;
  readonly kind: string;
  readonly children: ReactNode;
}) {
  return (
    <Collapsible
      showIndicator={false}
      className="-mx-control-padding-compact"
      data-change-row={kind}
    >
      <Collapsible.Trigger className="text-body-sm">
        <span className="flex min-w-0 items-center gap-2">
          <Icon name={icon} size="sm" aria-hidden="true" className="shrink-0 text-content-muted" />
          <span className="min-w-0 flex-1 text-content-primary">{label}</span>
          <Icon
            name="chevron-down"
            size="sm"
            aria-hidden="true"
            className="shrink-0 text-content-muted transition-transform group-data-[expanded]/collapsible:rotate-180 motion-reduce:transition-none"
          />
        </span>
      </Collapsible.Trigger>
      <Collapsible.Content className="pl-8 pr-control-padding-compact">
        {children}
      </Collapsible.Content>
    </Collapsible>
  );
}

function TaskList({
  specId,
  tasks,
}: {
  readonly specId: string;
  readonly tasks: AgentAttemptChanges['tasks'];
}) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const shown = all ? tasks : tasks.slice(0, TASKS_SHOWN);
  const more = tasks.length - shown.length;

  return (
    <ul className="grid text-body-sm" data-change-tasks="">
      {shown.map((task) => (
        <li key={task.id} className="min-w-0 [overflow-wrap:anywhere]">
          <TaskTitleLink specId={specId} task={task} />
        </li>
      ))}
      {more > 0 ? (
        <li>
          <InlineAction className="inline-flex min-h-6 items-center" onClick={() => setAll(true)}>
            {t('workflowExecution.attemptHistory.changes.moreTasks', { count: more })}
          </InlineAction>
        </li>
      ) : null}
    </ul>
  );
}

/**
 * What an agent attempt changed, as compact rows collapsed by default (workflow-execution.md,
 * "Activity history"): "N changed files" (its registered documents first, they open, then the other
 * files) and the Tasks it produced (by title), each row only when it has any. SpecFlow's own records
 * (`state`) stay in the read model for diagnosis and are never shown here.
 */
export function AttemptChanges({
  changes,
  specId,
  openDocument,
}: {
  readonly changes: AgentAttemptChanges;
  readonly specId: string;
  /** Opens a registered document by its checkout-relative path; false: it cannot open here. */
  readonly openDocument?: ((path: string) => boolean) | undefined;
}) {
  const { t } = useTranslation();
  const { directory, documents, tasks, files } = changes;
  if (documents.length + tasks.length + files.length === 0) {
    return null;
  }

  return (
    <div className="grid min-w-0" data-attempt-changes="">
      {documents.length + files.length > 0 ? (
        <ChangeRow
          kind="files"
          icon={productIcons.document.collection}
          label={t('workflowExecution.attemptHistory.changes.files', {
            count: documents.length + files.length,
          })}
        >
          {/* The registered documents first (they open), then every other file. */}
          <ul className="grid text-body-sm">
            {documents.map((path) => (
              <PathLine
                key={path}
                path={path}
                directory={directory}
                onOpen={openDocument ? () => openDocument(path) : undefined}
              />
            ))}
            {files.map((path) => (
              <PathLine key={path} path={path} directory={directory} />
            ))}
          </ul>
        </ChangeRow>
      ) : null}
      {tasks.length > 0 ? (
        <ChangeRow
          kind="tasks"
          icon={productIcons.task.collection}
          label={t('workflowExecution.attemptHistory.changes.tasks', { count: tasks.length })}
        >
          <TaskList specId={specId} tasks={tasks} />
        </ChangeRow>
      ) : null}
      {changes.truncated ? (
        <Typography as="p" variant="body-sm" className="text-content-muted">
          {t('workflowExecution.attemptHistory.changes.truncated')}
        </Typography>
      ) : null}
    </div>
  );
}

/** A committed attempt as one quiet row: "Committed · 05f9d80". */
export function CommittedRow({ sha }: { readonly sha?: string | undefined }) {
  const { t } = useTranslation();

  return (
    <Typography
      as="p"
      variant="body-sm"
      className="flex items-center gap-2 text-content-secondary"
      data-attempt-committed=""
    >
      <productIcons.commit aria-hidden="true" className="size-4 shrink-0 text-content-muted" />
      <span>
        {t('workflowExecution.attemptHistory.committed')}
        {sha ? (
          <>
            {' · '}
            <span className="font-mono">{sha.slice(0, 7)}</span>
          </>
        ) : null}
      </span>
    </Typography>
  );
}
