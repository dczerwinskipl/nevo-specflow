import { parseDocument } from 'yaml';

/**
 * Read-only detection of a leading YAML block (`---` ... `---`) in a document. The product gives
 * these properties no meaning: the block is only shown as a collapsed key/value list in the preview.
 */
export interface FrontmatterProperty {
  readonly key: string;
  /** The value, stringified; nested values are compact JSON. */
  readonly value: string;
}

export interface ParsedFrontmatter {
  readonly properties: readonly FrontmatterProperty[];
  /**
   * The document with the block replaced by the same number of empty lines, so every remaining
   * block keeps its line number from the file start (the scroll anchor maps source lines).
   */
  readonly body: string;
  /** Lines occupied by the block, including both fences. */
  readonly lineCount: number;
}

/** A block larger than this is not parsed (bounds work on hostile or accidental input). */
export const maxFrontmatterLength = 16 * 1024;
const maxProperties = 200;

const opening = /^---[ \t]*\r?\n/;
const closing = /^(---|\.\.\.)[ \t]*$/;

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
    return String(value);
  if (Array.isArray(value) && value.every((item) => item === null || typeof item !== 'object'))
    return value.map((item) => stringify(item)).join(', ');
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

/** Returns null unless the source starts with a well-formed, non-empty YAML mapping block. */
export function parseFrontmatter(source: string): ParsedFrontmatter | null {
  if (!opening.test(source)) return null;
  const lines = source.split('\n');
  let end = -1;
  for (let index = 1; index < lines.length; index++) {
    if (closing.test(lines[index]!.replace(/\r$/, ''))) {
      end = index;
      break;
    }
  }
  if (end === -1) return null;
  const yaml = lines
    .slice(1, end)
    .map((line) => line.replace(/\r$/, ''))
    .join('\n');
  if (yaml.trim() === '' || yaml.length > maxFrontmatterLength) return null;
  let data: unknown;
  try {
    const document = parseDocument(yaml, {
      merge: false,
      prettyErrors: false,
      logLevel: 'silent',
    });
    if (document.errors.length > 0) return null;
    data = document.toJS({ maxAliasCount: 10 });
  } catch {
    return null;
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const properties = Object.entries(data as Record<string, unknown>)
    .slice(0, maxProperties)
    .map(([key, value]) => ({ key, value: stringify(value) }));
  if (properties.length === 0) return null;
  const lineCount = end + 1;
  return {
    properties,
    lineCount,
    body: '\n'.repeat(lineCount) + lines.slice(lineCount).join('\n'),
  };
}
