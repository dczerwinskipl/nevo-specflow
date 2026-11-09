// The filesystem side of `adr new`: list, write and remove files in the ADR directory.

import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { AdrFiles } from '../app/create-adr.js';
import { ADR_DIRECTORY } from '../domain/adr.js';

export function createAdrFiles(projectRoot: string, docsRoot: string): AdrFiles {
  const adrDir = join(projectRoot, ...docsRoot.split('/'), ...ADR_DIRECTORY.split('/'));
  const abs = (file: string): string => join(projectRoot, ...file.split('/'));

  return {
    filenames(): string[] {
      try {
        return readdirSync(adrDir).filter((f) => f.endsWith('.md'));
      } catch (err) {
        throw new Error(
          `cannot read ${adrDir}: ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        );
      }
    },

    write(file, content): void {
      writeFileSync(abs(file), content);
    },

    remove(file): void {
      rmSync(abs(file), { force: true });
    },
  };
}
