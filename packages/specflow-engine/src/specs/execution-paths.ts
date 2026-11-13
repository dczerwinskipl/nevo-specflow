/**
 * Where a Specification's execution state lives, relative to its directory: `.execution/**` (the
 * Specification run and the Task run records) and `tasks/**` (the Task resources and the Task
 * documents). The Specification execution store writes these paths; their commits go through the
 * document commit policy (`specs/documents/write/execution-state.ts`), and a Specification Close
 * takes the ones still uncommitted into its archive commit. Pure; no filesystem access.
 */

/** The run records, next to the Specification (the leading dot keeps it out of the document tree). */
export const EXECUTION_DIRECTORY = '.execution';

/** The top-level folders of the execution state below the Specification directory. */
export const EXECUTION_STATE_FOLDERS: readonly string[] = [EXECUTION_DIRECTORY, 'tasks'];

/**
 * Whether a POSIX path relative to the Specification directory is execution state: below one of
 * {@link EXECUTION_STATE_FOLDERS}, with no empty, `.` or `..` segment and no backslash.
 */
export function isExecutionStatePath(relative: string): boolean {
  if (relative.includes(String.fromCharCode(0x5c))) {
    return false;
  }

  const segments = relative.split('/');

  return (
    segments.length >= 2 &&
    EXECUTION_STATE_FOLDERS.includes(segments[0]!) &&
    segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}

/** Whether a checkout-relative path is execution state of the Specification in `directory`. */
export function isExecutionStatePathOf(directory: string, path: string): boolean {
  return path.startsWith(directory + '/') && isExecutionStatePath(path.slice(directory.length + 1));
}
