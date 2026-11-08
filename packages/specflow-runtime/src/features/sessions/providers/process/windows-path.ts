/** Ordinary Win32 names only: no devices, streams, traversal or alias suffixes. */
export function assertWindowsPathComponent(name: string) {
  if (
    !name ||
    name === '.' ||
    name === '..' ||
    /[\\/:\0]|[ .]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
  ) {
    throw new Error('Unsupported Windows path component.');
  }
}
