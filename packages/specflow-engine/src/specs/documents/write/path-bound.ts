import { WINDOWS_ABSOLUTE_PATH_MAX } from '../../document-rules/limits';
import { documentChangeError } from '../changes/errors';
import type { DocumentChangePlan } from '../changes/plan/model';

/** Length of the fixed short name of the temporary file the writer creates next to a target. */
export const DOCUMENT_TEMP_NAME_LENGTH = 16;

export interface WindowsPathBoundOptions {
  /** Defaults to `process.platform`; injected by tests. The bound applies on `win32` only. */
  readonly platform?: NodeJS.Platform;
}

/**
 * On Windows, refuses a plan that would write a path (or the temporary sibling the writer stages it
 * in) longer than {@link WINDOWS_ABSOLUTE_PATH_MAX} below the checkout, as `path-too-long`. Removals
 * write nothing and are not judged. Pure; nothing is read or written. The message never carries an
 * absolute path.
 */
export function assertPlanFitsWindows(
  workspaceRoot: string,
  plan: Pick<DocumentChangePlan, 'paths'>,
  options: WindowsPathBoundOptions = {},
): void {
  if ((options.platform ?? process.platform) !== 'win32') return;
  for (const planned of plan.paths) {
    if (planned.post === null) continue;
    const slash = planned.path.lastIndexOf('/');
    const staged = (slash < 0 ? 0 : slash + 1) + DOCUMENT_TEMP_NAME_LENGTH;
    const actual = workspaceRoot.length + 1 + Math.max(planned.path.length, staged);
    if (actual > WINDOWS_ABSOLUTE_PATH_MAX) {
      throw documentChangeError(
        'path-too-long',
        `A document path is too long for this Windows checkout (${actual} above ${WINDOWS_ABSOLUTE_PATH_MAX} characters).`,
      );
    }
  }
}
