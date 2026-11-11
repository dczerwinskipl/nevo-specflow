import { compareScored, type Scored } from '../compare';
import { tokenize } from './tokenize';

/** Okapi BM25 parameters (the common defaults). */
export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

export interface Bm25Document {
  readonly id: string;
  readonly text: string;
}

export interface Bm25Index {
  /** Documents with a positive score, ordered by score then id. */
  search(query: string): Scored[];
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
    search(query) {
      const terms = [...new Set(tokenize(query))];
      const results: Scored[] = [];
      if (terms.length === 0 || averageLength === 0) {
        return results;
      }

      const idf = new Map<string, number>();
      for (const term of terms) {
        const containing = documentFrequency.get(term) ?? 0;
        idf.set(term, Math.log(1 + (count - containing + 0.5) / (containing + 0.5)));
      }

      documents.forEach((document, index) => {
        const frequencies = termFrequencies[index]!;
        const normalizer = BM25_K1 * (1 - BM25_B + (BM25_B * lengths[index]!) / averageLength);
        let score = 0;
        for (const term of terms) {
          const frequency = frequencies.get(term);
          if (frequency !== undefined) {
            score += (idf.get(term)! * frequency * (BM25_K1 + 1)) / (frequency + normalizer);
          }
        }

        if (score > 0) {
          results.push({ id: document.id, score });
        }
      });

      return results.sort(compareScored);
    },
  };
}
