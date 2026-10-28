/** The errno code of a failed filesystem call (`ENOENT`, `EACCES`, ...), when the failure has one. */
export function errnoCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined;
}

/** The entry is not there: it does not exist, or an ancestor is not a directory. */
export function isAbsent(error: unknown): boolean {
  const code = errnoCode(error);
  return code === 'ENOENT' || code === 'ENOTDIR';
}
