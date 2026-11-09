// The filesystem boundary of the documentation capability and its file-backed implementation.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

import { parseFrontmatter, type DocRecord } from '../frontmatter/contract';
import type { BuiltIndex, OnDiskIndex } from '../index-file/index-file';

export interface ScanResult {
  readonly docs: DocRecord[];
  /** Project-root-relative paths of markdown files that have no frontmatter and are not exempt. */
  readonly missingFrontmatter: string[];
}

/** Everything the discovery use cases touch on disk. */
export interface DocRepository {
  /** Walk the documentation root, parse frontmatter and return the deterministic corpus. */
  scan(): ScanResult;
  /** Whether a project-root-relative path (`/` separators) names an existing file or directory. */
  pathExists(projectRelPath: string): boolean;
  readIndex(): OnDiskIndex;
  writeIndex(index: BuiltIndex): void;
}

export const INDEX_JSON_FILE = 'index.generated.json';
export const INDEX_MD_FILE = 'index.generated.md';

function walkMarkdown(dir: string): string[] {
  const out: string[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }

  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walkMarkdown(full));
    } else if (extname(name) === '.md' && !name.includes('.generated.')) {
      out.push(full);
    }
  }

  return out;
}

export interface FileSystemDocRepositoryOptions {
  /** Absolute project root; document paths are reported relative to it. */
  readonly projectRoot: string;
  /** `docs.root` of the settings. */
  readonly root: string;
  /**
   * Host-specific frontmatter exemption for a path relative to the documentation root. The product
   * exempts nothing beyond the generated index files.
   */
  readonly isFrontmatterExempt?: (pathUnderRoot: string) => boolean;
}

export function createFileSystemDocRepository({
  projectRoot,
  root,
  isFrontmatterExempt,
}: FileSystemDocRepositoryOptions): DocRepository {
  const docsDir = join(projectRoot, ...root.split('/'));
  const toPosix = (path: string): string => path.split(sep).join('/');
  const entries = new Map<string, string[] | null>();
  const entriesOf = (dir: string): string[] | null => {
    if (!entries.has(dir)) {
      try {
        entries.set(dir, readdirSync(dir));
      } catch {
        entries.set(dir, null);
      }
    }

    return entries.get(dir) ?? null;
  };

  return {
    scan(): ScanResult {
      const docs: DocRecord[] = [];
      const missingFrontmatter: string[] = [];

      for (const abs of walkMarkdown(docsDir)) {
        const file = toPosix(relative(projectRoot, abs));
        const parsed = parseFrontmatter(readFileSync(abs, 'utf8'), file);
        if (parsed === null) {
          if (!isFrontmatterExempt?.(toPosix(relative(docsDir, abs)))) {
            missingFrontmatter.push(file);
          }

          continue;
        }

        docs.push({ ...parsed.frontmatter, file, body: parsed.body });
      }

      docs.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      missingFrontmatter.sort();

      return { docs, missingFrontmatter };
    },

    pathExists(projectRelPath): boolean {
      // Compare every segment with the exact directory entry: Windows and macOS file systems are
      // case-insensitive, but links are resolved case-sensitively on GitHub and in CI.
      let dir = projectRoot;
      for (const segment of projectRelPath.split('/')) {
        if (!segment || segment === '.' || segment === '..') {
          return false;
        }

        if (!entriesOf(dir)?.includes(segment)) {
          return false;
        }

        dir = join(dir, segment);
      }

      return true;
    },

    readIndex(): OnDiskIndex {
      const jsonPath = join(docsDir, INDEX_JSON_FILE);
      const mdPath = join(docsDir, INDEX_MD_FILE);

      return {
        json: existsSync(jsonPath) ? readFileSync(jsonPath, 'utf8') : null,
        md: existsSync(mdPath) ? readFileSync(mdPath, 'utf8') : null,
      };
    },

    writeIndex(index: BuiltIndex): void {
      writeFileSync(join(docsDir, INDEX_JSON_FILE), index.json);
      writeFileSync(join(docsDir, INDEX_MD_FILE), index.md);
    },
  };
}
