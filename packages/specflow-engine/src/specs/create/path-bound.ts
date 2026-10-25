import { ScaffoldValidationError } from '../scaffold';

/**
 * Longest absolute path (`workspaceRoot` + `/` + relative path, in characters) Create accepts on
 * Windows. Below the 260 characters of MAX_PATH with room for Git's own working files. The Engine
 * does not enable long paths (that is a per-user or per-repository setting it cannot verify), so a
 * longer path is refused before anything is written. See "Windows-hosted paths" in
 * `docs/architecture/runtime/specification-documents.md`.
 */
export const WINDOWS_ABSOLUTE_PATH_MAX = 240;

/** Length of the staged file name `.<uuid>.tmp` the scaffold writer creates next to each file. */
const STAGED_FILE_NAME_LENGTH = 1 + 36 + 4;

export interface WindowsPathBoundOptions {
  /** Defaults to `process.platform`; injected by tests. The bound applies on `win32` only. */
  readonly platform?: NodeJS.Platform;
}

/**
 * Refuses, as `path-too-long`, a scaffold whose longest file (or its staged sibling) would exceed
 * {@link WINDOWS_ABSOLUTE_PATH_MAX} below the workspace root. Pure: reads nothing, writes nothing.
 */
export function assertCreatePathsFitWindows(
  workspaceRoot: string,
  relativePaths: readonly string[],
  options: WindowsPathBoundOptions = {},
): void {
  if ((options.platform ?? process.platform) !== 'win32') return;
  for (const path of relativePaths) {
    const slash = path.lastIndexOf('/');
    const staged = slash < 0 ? STAGED_FILE_NAME_LENGTH : slash + 1 + STAGED_FILE_NAME_LENGTH;
    const actual = workspaceRoot.length + 1 + Math.max(path.length, staged);
    if (actual > WINDOWS_ABSOLUTE_PATH_MAX) {
      throw new ScaffoldValidationError(
        `A document path is too long for this Windows checkout (${actual} above ${WINDOWS_ABSOLUTE_PATH_MAX} characters).`,
        { kind: 'path-too-long', path, max: WINDOWS_ABSOLUTE_PATH_MAX, actual },
      );
    }
  }
}
