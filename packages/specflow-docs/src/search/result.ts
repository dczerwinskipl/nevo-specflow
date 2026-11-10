// One search hit as the `docs search` contract shows it: the document described by its frontmatter,
// so a reader can decide whether to open it, and its best sections as heading paths (with a one-line
// snippet only on request).

import type { Chunk, ChunkHit, UnitHit } from '@nevo/ai-semantic-search';
import type { DocsSearchHit, DocsSearchSection } from '@nevo/specflow-contracts/docs';

import { asString, type DocRecord } from '../frontmatter/contract';

/** Distinct matching sections shown per document (the contract's `sections` maximum). */
export const SECTIONS_PER_RESULT = 3;
const SNIPPET_MAX_CHARS = 280;

/**
 * @param sections the document's matching sections from the section ranking; `undefined` when only
 *   its frontmatter matched.
 * @param score the document's fused rank score.
 */
export function toHit(
  record: DocRecord,
  sections: UnitHit | undefined,
  score: number,
  snippets: boolean,
): DocsSearchHit {
  const summary = typeof record.summary === 'string' ? oneLine(record.summary) : '';
  const scope = asString(record.scope);
  const areas = strings(record.areas);
  const tags = strings(record.tags);
  const readWhen = strings(record.read_when);

  return {
    id: asString(record.id),
    title: asString(record.title),
    type: asString(record.type),
    status: asString(record.status),
    ...(scope ? { scope } : {}),
    ...(areas.length > 0 ? { areas } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    ...(summary ? { summary } : {}),
    ...(readWhen.length > 0 ? { readWhen } : {}),
    file: record.file,
    score,
    sections: bestSections(sections?.chunks ?? []).map(
      ({ chunk, score: sectionScore }): DocsSearchSection => ({
        headingPath: [...chunk.headingPath],
        score: sectionScore,
        ...(snippets ? { snippet: snippet(chunk.text, isContinuationPart(chunk)) } : {}),
      }),
    ),
  };
}

/**
 * The best `SECTIONS_PER_RESULT` sections, one per heading path: the parts of an oversize section
 * share its heading path, and only the best-ranked part is shown.
 */
function bestSections(chunks: readonly ChunkHit[]): ChunkHit[] {
  const seen = new Set<string>();
  const best: ChunkHit[] = [];
  for (const hit of chunks) {
    const key = JSON.stringify(hit.chunk.headingPath);
    if (!seen.has(key)) {
      seen.add(key);
      best.push(hit);
      if (best.length === SECTIONS_PER_RESULT) {
        break;
      }
    }
  }

  return best;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => oneLine(asString(item))).filter(Boolean) : [];
}

/**
 * A second or later part of an oversize section (ADR 0021 chunking): it starts inside the section,
 * usually inside a word. The first part of a section with a heading starts with its heading line;
 * text before the first heading has the empty heading path and part ids `<unit>#/<n>`.
 */
function isContinuationPart(chunk: Chunk): boolean {
  return chunk.headingPath.length > 0
    ? !/^ {0,3}#{1,6}(?:\s|$)/u.test(chunk.text)
    : /#\/(?:[2-9]|[1-9]\d+)$/u.test(chunk.id);
}

/**
 * The section text without its heading lines, on one line, cut at a word boundary. A continuation
 * part drops its first, usually partial, word and starts with an ellipsis.
 */
export function snippet(text: string, continuation = false): string {
  let prose = oneLine(
    text
      .split('\n')
      .filter((line) => !/^#{1,6}\s/.test(line))
      .join(' '),
  );
  if (continuation) {
    const rest = prose.replace(/^\S*\s+/u, '');
    prose = rest === prose ? prose : `…${rest}`;
  }

  if (prose.length <= SNIPPET_MAX_CHARS) {
    return prose;
  }

  const cut = prose.slice(0, SNIPPET_MAX_CHARS);
  const space = cut.lastIndexOf(' ');

  return `${(space > SNIPPET_MAX_CHARS / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
