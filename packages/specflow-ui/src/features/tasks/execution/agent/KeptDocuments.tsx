import { Fragment } from 'react';
import { TextAction } from '../../../../shared/actions';

/** The Task a checkout-relative document path belongs to: its `tasks/<task-id>/` folder. */
const TASK_FOLDER = /(?:^|\/)tasks\/([^/]+)\//;

export function taskIdOfPath(path: string): string | undefined {
  return TASK_FOLDER.exec(path)?.[1];
}

interface KeptGroup {
  /** The Task's title; absent for the Specification's own documents. */
  readonly task?: string;
  readonly paths: string[];
}

/**
 * The documents an attempt left, by file name, each one opening where it can; a Task's documents
 * are named with the Task they belong to ("Sign-in screen: task.md, screens.md"), since every
 * Task has its own `task.md`. A Task whose title is not known keeps its documents' bare names.
 */
export function KeptDocuments({
  paths,
  openDocument,
  taskTitle,
}: {
  readonly paths: readonly string[];
  readonly openDocument: ((path: string) => boolean) | undefined;
  /** The title of a Task by its id, when known. */
  readonly taskTitle?: ((taskId: string) => string | undefined) | undefined;
}) {
  const groups: KeptGroup[] = [];
  for (const path of paths) {
    const taskId = taskIdOfPath(path);
    const task = taskId !== undefined ? taskTitle?.(taskId) : undefined;
    const group =
      task !== undefined ? groups.find((candidate) => candidate.task === task) : undefined;
    if (group) {
      group.paths.push(path);
    } else {
      groups.push({ ...(task !== undefined ? { task } : {}), paths: [path] });
    }
  }

  return (
    <>
      {groups.map((group, groupIndex) => (
        <Fragment key={`${group.task ?? ''}:${group.paths[0]}`}>
          {groupIndex > 0
            ? group.task !== undefined || groups[groupIndex - 1]?.task !== undefined
              ? '; '
              : ', '
            : null}
          {group.task !== undefined ? (
            <span className="text-content-primary" data-kept-task="">
              {group.task}:{' '}
            </span>
          ) : null}
          {group.paths.map((path, index) => {
            const name = path.split('/').at(-1) ?? path;

            return (
              <Fragment key={path}>
                {index > 0 ? ', ' : null}
                {openDocument ? (
                  <TextAction onClick={() => openDocument(path)}>{name}</TextAction>
                ) : (
                  name
                )}
              </Fragment>
            );
          })}
        </Fragment>
      ))}
    </>
  );
}
