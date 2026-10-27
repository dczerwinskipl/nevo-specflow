/**
 * Write access to a definitions tree, used only by the install engine. A write is atomic: readers see
 * the old file or the whole new file, never a partial one. The writer commits nothing; the install
 * engine decides whether the written files are committed.
 */
export interface WriteOptions {
  /** Fail instead of replacing a file that exists (a file the plan did not see must never be lost). */
  readonly exclusive?: boolean;
}

export interface DefinitionWriter {
  writeAtomic(path: string, bytes: Uint8Array, options?: WriteOptions): Promise<void>;
}
