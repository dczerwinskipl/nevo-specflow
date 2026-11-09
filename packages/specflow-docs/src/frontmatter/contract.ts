// The product frontmatter contract (ADR 0020): document types, required fields per type, statuses
// and inactive statuses, plus parsing of the frontmatter block. None of this is configuration.

import { parse } from 'yaml';

import { DocsError } from '../errors';

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n([\s\S]*))?$/;

export type DocType =
  'hub' | 'architecture' | 'adr' | 'engineering' | 'product' | 'reference' | 'instruction';
export type DocStatus = 'current' | 'draft' | 'deprecated' | 'superseded';

/** Required fields per `type`. */
export const REQUIRED_FIELDS: Record<DocType, readonly string[]> = {
  hub: ['id', 'type', 'title', 'status'],
  engineering: ['id', 'type', 'title', 'status', 'read_when', 'summary'],
  product: ['id', 'type', 'title', 'status', 'read_when', 'summary'],
  architecture: ['id', 'type', 'title', 'status', 'read_when', 'summary'],
  reference: ['id', 'type', 'title', 'status', 'read_when', 'summary'],
  instruction: ['id', 'type', 'title', 'status', 'read_when', 'summary'],
  adr: ['id', 'type', 'title', 'status', 'date'],
};

export const KNOWN_TYPES = Object.keys(REQUIRED_FIELDS) as DocType[];
export const KNOWN_STATUSES: readonly DocStatus[] = [
  'current',
  'draft',
  'deprecated',
  'superseded',
];

/**
 * Statuses of superseded or retired knowledge. `context` excludes them and `get` refuses them, so a
 * caller is never handed guidance a newer document replaced.
 */
export const INACTIVE_STATUSES: readonly DocStatus[] = ['deprecated', 'superseded'];

export function isInactiveStatus(status: unknown): boolean {
  return (INACTIVE_STATUSES as readonly unknown[]).includes(status);
}

/** A parsed document: open frontmatter plus the fields discovery relies on. */
export interface DocRecord {
  /** Path relative to the project root, with `/` separators (for example `docs/README.md`). */
  readonly file: string;
  /** Markdown body after the frontmatter block. */
  readonly body: string;
  readonly id?: unknown;
  readonly type?: unknown;
  readonly title?: unknown;
  readonly status?: unknown;
  readonly date?: unknown;
  readonly summary?: unknown;
  readonly read_when?: unknown;
  readonly related?: unknown;
  readonly scope?: unknown;
  readonly areas?: unknown;
  readonly tags?: unknown;
  readonly superseded_by?: unknown;
  readonly supersedes?: unknown;
  readonly [key: string]: unknown;
}

/** Coerce an untrusted frontmatter value to a string without `[object Object]`. */
export function asString(v: unknown, fallback = ''): string {
  if (typeof v === 'string') {
    return v;
  }

  if (v == null) {
    return fallback;
  }

  if (typeof v === 'number' || typeof v === 'boolean') {
    return String(v);
  }

  return JSON.stringify(v);
}

function stripTrailingNewlines(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\n+$/, '');
  }

  if (Array.isArray(value)) {
    return value.map(stripTrailingNewlines);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        stripTrailingNewlines(v),
      ]),
    );
  }

  return value;
}

export interface ParsedMarkdown {
  readonly frontmatter: Record<string, unknown>;
  readonly body: string;
}

/** Extract and parse the frontmatter block; `null` when there is no block at all. */
export function parseFrontmatter(content: string, label = 'document'): ParsedMarkdown | null {
  const match = FRONT_MATTER_RE.exec(content);
  if (!match) {
    return null;
  }

  try {
    const parsed = stripTrailingNewlines(parse(match[1] ?? '') ?? {});
    const frontmatter =
      typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};

    // Drop the single blank line that conventionally separates the block from the body.
    return { frontmatter, body: (match[2] ?? '').replace(/^\r?\n/, '') };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);

    throw new DocsError(`Invalid YAML frontmatter in ${label}: ${detail}`, { cause: err });
  }
}
