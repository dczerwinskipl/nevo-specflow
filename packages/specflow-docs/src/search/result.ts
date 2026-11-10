// One search hit as the `docs search` contract shows it: the document and its best sections, each
// with a one-line snippet.

import type { Chunk, UnitHit } from '@nevo/ai-semantic-search';
import type { DocsSearchHit } from '@nevo/specflow-contracts/docs';

import type { DocsChunk } from '../semantic-index/chunk-source';

/** Matching sections shown per document. */
export const CHUNKS_PER_RESULT = 3;
const SNIPPET_MAX_CHARS = 280;

export function toHit(hit: UnitHit): DocsSearchHit {
  const best = hit.chunks[0]!.chunk as DocsChunk;

  return {
    id: hit.unitId,
    title: best.metadata.title,
    file: best.metadata.file,
    score: hit.score,
    chunks: hit.chunks.slice(0, CHUNKS_PER_RESULT).map(({ chunk, score }) => ({
      headingPath: [...chunk.headingPath],
      snippet: snippet(chunk.text, isContinuationPart(chunk)),
      score,
    })),
  };
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
  let prose = text
    .split('\n')
    .filter((line) => !/^#{1,6}\s/.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
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
