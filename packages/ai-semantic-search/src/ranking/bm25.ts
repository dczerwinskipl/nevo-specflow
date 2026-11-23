import { compareScored, type Scored } from '../compare';
import { tokenize } from './tokenize';

/** Okapi BM25 parameters (the common defaults). */
export const BM25_K1 = 1.2;
export const BM25_B = 0.75;
/** Short prefixes are too ambiguous; long expansions must not enumerate the whole vocabulary. */
export const PREFIX_MIN_LENGTH = 4;
export const PREFIX_MAX_EXPANSIONS = 32;

export interface Bm25SearchOptions {
  /** Expand an unknown single-word query; sentences retain exact lexical matching. */
  readonly prefixes?: boolean;
  readonly accept?: (id: string) => boolean;
}

export interface Bm25Document {
  readonly id: string;
  readonly text: string;
}

export interface Bm25Index {
  /** Documents with a positive score, ordered by score then id. */
  search(query: string, options?: Bm25SearchOptions): Scored[];
}

/** Builds an in-memory BM25 index; document ids must be unique. */
export function createBm25Index(documents: readonly Bm25Document[]): Bm25Index {
  const termFrequencies: Map<string, number>[] = [];
  const lengths: number[] = [];
  const documentFrequency = new Map<string, number>();
  const seen = new Set<string>();

  for (const document of documents) {
    if (seen.has(document.id)) {
      throw new Error(`Duplicate BM25 document id: ${document.id}`);
    }

    seen.add(document.id);

    const tokens = tokenize(document.text);
    const frequencies = new Map<string, number>();
    for (const token of tokens) {
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }

    for (const term of frequencies.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }

    termFrequencies.push(frequencies);
    lengths.push(tokens.length);
  }

  const count = documents.length;
  const averageLength = count === 0 ? 0 : lengths.reduce((sum, length) => sum + length, 0) / count;

  return {
    search(query, options = {}) {
      const queryTokens = tokenize(query);
      const terms = [...new Set(queryTokens)];
      const results: Scored[] = [];
      if (terms.length === 0 || averageLength === 0) {
        return results;
      }

      const accepted = documents.map((document) => !options.accept || options.accept(document.id));
      const prefixes =
        options.prefixes && queryTokens.length === 1 && [...terms[0]!].length >= PREFIX_MIN_LENGTH;
      const vocabulary = new Set<string>();
      if (prefixes) {
        termFrequencies.forEach((frequencies, index) => {
          if (accepted[index]) {
            frequencies.forEach((_, term) => vocabulary.add(term));
          }
        });
      }

      // Exact terms retain their original ranking. Expand only an otherwise unknown word,
      // using visible documents only: excluded units cannot consume the expansion bound.
      const alternatives = terms.map((term) => {
        if (!prefixes || [...term].length < PREFIX_MIN_LENGTH || vocabulary.has(term)) {
          return [term];
        }

        const matches: string[] = [];
        for (const candidate of vocabulary) {
          if (candidate.startsWith(term)) {
            matches.push(candidate);
            if (matches.length > PREFIX_MAX_EXPANSIONS) {
              return [term];
            }
          }
        }

        return matches.length > 0 ? matches : [term];
      });
      const idf = new Map<string, number>();
      for (const term of alternatives.flat()) {
        const containing = documentFrequency.get(term) ?? 0;
        idf.set(term, Math.log(1 + (count - containing + 0.5) / (containing + 0.5)));
      }

      documents.forEach((document, index) => {
        if (!accepted[index]) {
          return;
        }

        const frequencies = termFrequencies[index]!;
        const normalizer = BM25_K1 * (1 - BM25_B + (BM25_B * lengths[index]!) / averageLength);
        let score = 0;
        for (const choices of alternatives) {
          let best = 0;
          for (const term of choices) {
            const frequency = frequencies.get(term);
            if (frequency !== undefined) {
              best = Math.max(
                best,
                (idf.get(term)! * frequency * (BM25_K1 + 1)) / (frequency + normalizer),
              );
            }
          }

          // One incomplete query word is one contribution, even when a document contains many
          // completions. Repeated variants must not inflate its score.
          score += best;
        }

        if (score > 0) {
          results.push({ id: document.id, score });
        }
      });

      return results.sort(compareScored);
    },
  };
}
