// The filesystem boundary of the documentation capability and its file-backed implementation.

import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  type Stats,
} from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';

import { parseFrontmatter, type DocRecord } from '../frontmatter/contract';

export interface ScanResult {
  readonly docs: DocRecord[];
  /** Project-root-relative paths of markdown files that have no frontmatter. */
  readonly missingFrontmatter: string[];
}

/** Everything the discovery use cases touch on disk. */
export interface DocRepository {
  /** Walk the documentation root, parse frontmatter and return the deterministic corpus. */
  scan(): ScanResult;
  /**
   * The markdown files `scan` reads (generated index files, excluded directories and symbolic links
   * left out), in walk order, as project-root-relative paths with `/` separators, without reading
   * them. Asynchronous, for the long-lived Runtime.
   */
  listMarkdownFiles(): Promise<string[]>;
  /** Read one file `scan` or `listMarkdownFiles` returned. */
  readMarkdownFile(file: string): string;
  /** `readMarkdownFile`, asynchronously. */
  readMarkdownFileAsync(file: string): Promise<string>;
  /** Whether a project-root-relative path (`/` separators) names an existing file or directory. */
  pathExists(projectRelPath: string): boolean;
  readIndex(): OnDiskIndex;
  writeIndex(index: BuiltIndex): void;
}

/** The generated index files as written to the documentation root. */
export interface BuiltIndex {
  readonly json: string;
  readonly md: string;
}

/** The generated index files as found on disk; `null` when a file is missing. */
export interface OnDiskIndex {
  readonly md: string | null;
  readonly json: string | null;
}

export const INDEX_JSON_FILE = 'index.generated.json';
export const INDEX_MD_FILE = 'index.generated.md';

/**
 * What the walk does with a directory entry, from its `lstat`. Symbolic links (and Windows
 * junctions) are never followed, to a directory or a file: the corpus is what physically lies
 * below `docs.root`, so a link can neither loop the walk nor pull in files from elsewhere.
 */
function entryKind(stat: Stats | undefined, name: string): 'directory' | 'markdown' | 'skip' {
  if (stat === undefined || stat.isSymbolicLink()) {
    return 'skip';
  }

  if (stat.isDirectory()) {
    return 'directory';
  }

  return stat.isFile() && extname(name) === '.md' && !name.includes('.generated.')
    ? 'markdown'
    : 'skip';
}

const byName = (a: string, b: string) => a.localeCompare(b);

/**
 * Markdown files below `dir` in a deterministic order. `under` is `dir` relative to the
 * documentation root (`''` for the root itself); directories in `exclude` are not entered. An entry
 * that disappears during the walk is skipped.
 */
function walkMarkdown(dir: string, under: string, exclude: ReadonlySet<string>): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }

  const out: string[] = [];
  for (const name of names.sort(byName)) {
    const full = join(dir, name);
    const kind = entryKind(lstatSync(full, { throwIfNoEntry: false }), name);
    const child = under ? `${under}/${name}` : name;
    if (kind === 'directory' && !exclude.has(child)) {
      out.push(...walkMarkdown(full, child, exclude));
    } else if (kind === 'markdown') {
      out.push(full);
    }
  }

  return out;
}

/** `walkMarkdown` without blocking the event loop. */
async function walkMarkdownAsync(
  dir: string,
  under: string,
  exclude: ReadonlySet<string>,
): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }

  const out: string[] = [];
  for (const name of names.sort(byName)) {
    const full = join(dir, name);
    const kind = entryKind(await lstat(full).catch(() => undefined), name);
    const child = under ? `${under}/${name}` : name;
    if (kind === 'directory' && !exclude.has(child)) {
      out.push(...(await walkMarkdownAsync(full, child, exclude)));
    } else if (kind === 'markdown') {
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
  /** `exclude` of `docs.yaml`: directory prefixes relative to `root` that are not scanned. Default none. */
  readonly exclude?: readonly string[];
}

export function createFileSystemDocRepository({
  projectRoot,
  root,
  exclude = [],
}: FileSystemDocRepositoryOptions): DocRepository {
  const docsDir = join(projectRoot, ...root.split('/'));
  const excluded = new Set(exclude);
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

      for (const abs of walkMarkdown(docsDir, '', excluded)) {
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

    async listMarkdownFiles(): Promise<string[]> {
      return (await walkMarkdownAsync(docsDir, '', excluded)).map((abs) =>
        toPosix(relative(projectRoot, abs)),
      );
    },

    readMarkdownFile(file): string {
      return readFileSync(join(projectRoot, ...file.split('/')), 'utf8');
    },

    readMarkdownFileAsync(file): Promise<string> {
      return readFile(join(projectRoot, ...file.split('/')), 'utf8');
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
