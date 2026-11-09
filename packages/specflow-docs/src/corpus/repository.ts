// The filesystem boundary of the documentation capability and its file-backed implementation.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

import { parseFrontmatter, type DocRecord } from '../frontmatter/contract';
import type { BuiltIndex, OnDiskIndex } from '../index-file/index-file';

export interface ScanResult {
  readonly docs: DocRecord[];
  /** Project-root-relative paths of markdown files that have no frontmatter. */
  readonly missingFrontmatter: string[];
}

/** One markdown file under the documentation root and the stat the search freshness check uses. */
export interface MarkdownFileStat {
  /** Path relative to the project root, with `/` separators. */
  readonly file: string;
  readonly mtimeMs: number;
  readonly size: number;
}

/** Everything the discovery use cases touch on disk. */
export interface DocRepository {
  /** Walk the documentation root, parse frontmatter and return the deterministic corpus. */
  scan(): ScanResult;
  /**
   * The markdown files `scan` reads (generated index files and excluded directories left out), in
   * walk order, with their
   * stat and without reading them.
   */
  listMarkdownFiles(): MarkdownFileStat[];
  /** Read one file `listMarkdownFiles` returned. */
  readMarkdownFile(file: string): string;
  /** Whether a project-root-relative path (`/` separators) names an existing file or directory. */
  pathExists(projectRelPath: string): boolean;
  readIndex(): OnDiskIndex;
  writeIndex(index: BuiltIndex): void;
}

export const INDEX_JSON_FILE = 'index.generated.json';
export const INDEX_MD_FILE = 'index.generated.md';

/**
 * Markdown files below `dir` in a deterministic order. `under` is `dir` relative to the
 * documentation root (`''` for the root itself); directories in `exclude` are not entered.
 */
function walkMarkdown(
  dir: string,
  under: string,
  exclude: ReadonlySet<string>,
): { abs: string; mtimeMs: number; size: number }[] {
  const out: { abs: string; mtimeMs: number; size: number }[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }

  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      const child = under ? `${under}/${name}` : name;
      if (!exclude.has(child)) {
        out.push(...walkMarkdown(full, child, exclude));
      }
    } else if (extname(name) === '.md' && !name.includes('.generated.')) {
      out.push({ abs: full, mtimeMs: stat.mtimeMs, size: stat.size });
    }
  }

  return out;
}

export interface FileSystemDocRepositoryOptions {
  /** Absolute project root; document paths are reported relative to it. */
  readonly projectRoot: string;
  /** `docs.root` of the settings. */
  readonly root: string;
  /** `docs.exclude`: directory prefixes relative to `root` that are not scanned. Default none. */
  readonly exclude?: readonly string[];
}

export function createFileSystemDocRepository({
  projectRoot,
  root,
  exclude = [],
}: FileSystemDocRepositoryOptions): DocRepository {
  const docsDir = join(projectRoot, ...root.split('/'));
  const excluded = new Set(exclude);
  const markdownFiles = () => walkMarkdown(docsDir, '', excluded);
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

      for (const { abs } of markdownFiles()) {
        const file = toPosix(relative(projectRoot, abs));
        const parsed = parseFrontmatter(readFileSync(abs, 'utf8'), file);
        if (parsed === null) {
          missingFrontmatter.push(file);
          continue;
        }

        docs.push({ ...parsed.frontmatter, file, body: parsed.body });
      }

      docs.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      missingFrontmatter.sort();

      return { docs, missingFrontmatter };
    },

    listMarkdownFiles(): MarkdownFileStat[] {
      return markdownFiles().map(({ abs, mtimeMs, size }) => ({
        file: toPosix(relative(projectRoot, abs)),
        mtimeMs,
        size,
      }));
    },

    readMarkdownFile(file): string {
      return readFileSync(join(projectRoot, ...file.split('/')), 'utf8');
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
