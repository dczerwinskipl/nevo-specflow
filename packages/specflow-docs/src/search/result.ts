// One search hit as the `docs search` contract shows it: the document described by its frontmatter,
// so a reader can decide whether to open it, and its best sections with their ids, lines and a
// query-aware excerpt (`excerpt.ts`, unless snippets are turned off).

import type { ChunkHit, UnitHit } from '@nevo/ai-semantic-search';
import type { DocsSearchHit, DocsSearchSection } from '@nevo/specflow-contracts/docs';

import { asString, type DocRecord } from '../frontmatter/contract';
import type { DocsChunk } from '../semantic-index/chunk-source';
import { excerpt } from './excerpt';

/** Distinct matching sections shown per document (the contract's `sections` maximum). */
export const SECTIONS_PER_RESULT = 3;

/**
 * @param sections the document's matching sections from the section ranking; `undefined` when only
 *   its frontmatter matched.
 * @param score the document's fused rank score.
 * @param query the question the excerpts are chosen for; `undefined` shows no excerpts.
 */
export function toHit(
  record: DocRecord,
  sections: UnitHit | undefined,
  score: number,
  query: string | undefined,
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
        sectionId: chunk.sectionId,
        line: (chunk as DocsChunk).startLine,
        score: sectionScore,
        ...(query === undefined ? {} : { snippet: excerpt(chunk.text, query) }),
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

/** `text` when it fits `max` characters, otherwise cut at a word boundary with an ellipsis. */
export function cutAtWord(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }

  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');

  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
