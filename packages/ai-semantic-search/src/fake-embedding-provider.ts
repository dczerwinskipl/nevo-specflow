import type {
  EmbeddingFailure,
  EmbeddingProvider,
  EmbeddingPurpose,
  EmbeddingResult,
  ProbeResult,
} from './ports';
import { PROBE_TEXT } from './openai-compatible-embeddings';
import { tokenize } from './tokenize';

export const FAKE_EMBEDDING_PROTOCOL = 'fake';

export interface FakeEmbeddingCall {
  readonly texts: readonly string[];
  readonly purpose: EmbeddingPurpose;
}

export interface FakeEmbeddingProvider extends EmbeddingProvider {
  /** Every `embed` call in order (probe calls included). */
  readonly calls: readonly FakeEmbeddingCall[];
  /** Makes every following call fail with `failure`, or succeed again with `undefined`. */
  failWith(failure: EmbeddingFailure | undefined): void;
}

export interface FakeEmbeddingOptions {
  readonly model?: string;
  readonly dimensions?: number;
}

/**
 * Deterministic in-process `EmbeddingProvider` for tests: each text becomes a normalized hashed bag
 * of its tokens, so texts sharing words have a higher cosine similarity. No network, no timers.
 */
export function createFakeEmbeddingProvider(
  options: FakeEmbeddingOptions = {},
): FakeEmbeddingProvider {
  const dimensions = options.dimensions ?? 32;
  const calls: FakeEmbeddingCall[] = [];
  let failure: EmbeddingFailure | undefined;

  const embed = (texts: readonly string[], purpose: EmbeddingPurpose): Promise<EmbeddingResult> => {
    calls.push({ texts: [...texts], purpose });

    return Promise.resolve(
      failure
        ? { ok: false, failure }
        : { ok: true, vectors: texts.map((text) => hashedVector(text, dimensions)) },
    );
  };

  return {
    protocol: FAKE_EMBEDDING_PROTOCOL,
    model: options.model ?? 'fake-embedding',
    dimensions,
    calls,
    failWith(next) {
      failure = next;
    },
    embed,
    async probe(): Promise<ProbeResult> {
      const result = await embed([PROBE_TEXT], 'document');

      return result.ok
        ? { ok: true, latencyMs: 0, dimensions }
        : { ok: false, latencyMs: 0, failure: result.failure };
    },
  };
}

function hashedVector(text: string, dimensions: number): Float32Array {
  const vector = new Float32Array(dimensions);
  for (const token of tokenize(text)) {
    const hash = fnv1a(token);
    vector[hash % dimensions]! += (hash & 0x8000_0000) === 0 ? 1 : -1;
  }

  let norm = 0;
  for (const value of vector) {
    norm += value * value;
  }

  if (norm > 0) {
    const scale = 1 / Math.sqrt(norm);
    for (let index = 0; index < dimensions; index += 1) {
      vector[index]! *= scale;
    }
  }

  return vector;
}

function fnv1a(value: string): number {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193) >>> 0;
  }

  return hash;
}
