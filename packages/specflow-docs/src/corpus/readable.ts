// The documents a reader command can use (ADR 0022): `list`, `find`, `get`, `context`, `search` and
// the index skip a document that cannot be trusted and report it, instead of refusing the whole
// corpus. `check` stays strict and does not use this.

import type { DocsTaxonomy } from '../config/docs-file';
import type { DocRecord } from '../frontmatter/contract';
import { validateDoc } from '../frontmatter/validate';
import type { ScanResult } from './repository';

/** A document left out of a read, with the reason. `path` is relative to `docs.root`'s project. */
export interface SkippedDocument {
  readonly path: string;
  readonly error: string;
}

export interface ReadableDocs {
  readonly docs: DocRecord[];
  readonly skipped: SkippedDocument[];
  /** The skipped documents that declare an id (a string), by id, so `get` can name the error. */
  readonly skippedById: ReadonlyMap<string, readonly SkippedDocument[]>;
}

/**
 * Skip a file without frontmatter or with unparseable frontmatter, a document whose own frontmatter fails validation, and every
 * document sharing an id with another (all of them: none is the right one). An unresolved
 * `related`, `superseded_by` or `supersedes` does not skip a document; only `check` reports it.
 */
export function selectReadableDocs(scan: ScanResult, taxonomy: DocsTaxonomy): ReadableDocs {
  const skipped: SkippedDocument[] = [
    ...scan.missingFrontmatter.map((path) => ({ path, error: 'missing frontmatter' })),
    ...scan.invalidFrontmatter.map(({ file, error }) => ({ path: file, error })),
  ];

  const filesById = new Map<string, string[]>();
  for (const doc of scan.docs) {
    if (typeof doc.id === 'string') {
      filesById.set(doc.id, [...(filesById.get(doc.id) ?? []), doc.file]);
    }
  }

  const docs: DocRecord[] = [];
  const skippedById = new Map<string, SkippedDocument[]>();
  for (const doc of scan.docs) {
    const own = validateDoc(doc, taxonomy).map((problem) => problem.replace(`${doc.file}: `, ''));
    const sharing = typeof doc.id === 'string' ? filesById.get(doc.id)! : [];
    const others = sharing.filter((file) => file !== doc.file);
    if (others.length > 0) {
      own.push(`duplicate id '${String(doc.id)}' (also in ${others.join(', ')})`);
    }

    if (own.length > 0) {
      const entry = { path: doc.file, error: own.join('; ') };
      skipped.push(entry);
      if (typeof doc.id === 'string') {
        skippedById.set(doc.id, [...(skippedById.get(doc.id) ?? []), entry]);
      }
    } else {
      docs.push(doc);
    }
  }

  skipped.sort((a, b) => a.path.localeCompare(b.path));

  return { docs, skipped, skippedById };
}

/** Scan and select the readable documents. Throws only when the corpus cannot be scanned. */
export function loadReadableDocs(corpus: {
  readonly repo: { scan(): ScanResult };
  readonly settings: { readonly taxonomy: DocsTaxonomy };
}): ReadableDocs {
  return selectReadableDocs(corpus.repo.scan(), corpus.settings.taxonomy);
}
