import {
  PROBE_TEXT,
  type EmbeddingFailure,
  type EmbeddingProvider,
  type EmbeddingPurpose,
  type EmbeddingResult,
  type ProbeResult,
} from './embedding-provider';

export const OPENAI_COMPATIBLE_PROTOCOL = 'openai-compatible';
/**
 * Sized for a local CPU model: a 0.6B model on an 8-core CPU embeds 16 chunks of about 1200
 * characters in roughly 10 s, so 60 s per request leaves headroom for a slower machine or a model
 * that is still loading. A hosted API answers far faster.
 */
export const DEFAULT_EMBEDDING_BATCH_SIZE = 16;
export const DEFAULT_EMBEDDING_TIMEOUT_MS = 60_000;

const MAX_ERROR_BODY_CHARS = 300;
const malformedBody = Symbol('malformed body');

/** Settings resolved by the consumer; the engine reads no configuration files or environment. */
export interface OpenAiCompatibleEmbeddingSettings {
  /** Base URL of the API, for example `http://127.0.0.1:11434/v1`; `/embeddings` is appended. */
  readonly baseUrl: string;
  readonly model: string;
  /** Expected vector dimension; when set, any other observed dimension is an error. */
  readonly dimensions?: number;
  /** Bearer token value, already read by the consumer (for example from an environment variable). */
  readonly apiKey?: string;
  /** Prefix prepended to query texts only (instruction-tuned models). */
  readonly queryInstruction?: string;
  readonly batchSize?: number;
  /** Per request. */
  readonly timeoutMs?: number;
}

/** Injectable runtime dependencies; production uses the defaults. */
export interface OpenAiCompatibleEmbeddingDependencies {
  readonly fetch?: typeof fetch;
  /** Monotonic milliseconds for probe latency. */
  readonly now?: () => number;
  /** Signal that aborts a request after `timeoutMs`. */
  readonly timeoutSignal?: (timeoutMs: number) => AbortSignal;
}

/**
 * `EmbeddingProvider` for the OpenAI-compatible `POST {baseUrl}/embeddings` call (Ollama, LM Studio,
 * vLLM, llama.cpp server, TEI, OpenAI, Azure OpenAI and others). Texts are sent in sequential
 * batches; every failure is returned as a typed `EmbeddingFailure`.
 */
export function createOpenAiCompatibleEmbeddingProvider(
  settings: OpenAiCompatibleEmbeddingSettings,
  dependencies: OpenAiCompatibleEmbeddingDependencies = {},
): EmbeddingProvider {
  const { href: endpointHref, display: endpoint } = embeddingsEndpoint(settings.baseUrl);
  const batchSize = positiveInteger(
    'batchSize',
    settings.batchSize ?? DEFAULT_EMBEDDING_BATCH_SIZE,
  );
  const timeoutMs = positiveInteger(
    'timeoutMs',
    settings.timeoutMs ?? DEFAULT_EMBEDDING_TIMEOUT_MS,
  );
  if (settings.model.trim().length === 0) {
    throw new TypeError('Embedding model must not be empty.');
  }

  if (settings.dimensions !== undefined) {
    positiveInteger('dimensions', settings.dimensions);
  }

  const fetchImpl = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? (() => performance.now());
  const timeoutSignal = dependencies.timeoutSignal ?? ((ms: number) => AbortSignal.timeout(ms));

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (settings.apiKey !== undefined && settings.apiKey.length > 0) {
    headers.authorization = `Bearer ${settings.apiKey}`;
  }

  const timedOut = () =>
    failure({ code: 'timeout', message: `${endpoint} did not answer within ${timeoutMs} ms.` });

  async function requestBatch(input: readonly string[]): Promise<EmbeddingResult> {
    const signal = timeoutSignal(timeoutMs);
    let response: Response;
    let body: unknown;
    try {
      response = await fetchImpl(endpointHref, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: settings.model, input }),
        signal,
      });
      if (!response.ok) {
        const text = await response.text();

        return failure({
          code: 'http-status',
          status: response.status,
          message: `${endpoint} answered HTTP ${response.status}${text ? `: ${text.slice(0, MAX_ERROR_BODY_CHARS)}` : ''}`,
        });
      }

      body = await response.json().catch(() => malformedBody);
      // An abort while the body streams rejects the JSON read; it is a timeout, not a bad body.
      if (signal.aborted) {
        return timedOut();
      }
    } catch (error) {
      if (signal.aborted) {
        return timedOut();
      }

      return failure({
        code: 'unreachable',
        message: `${endpoint} is unreachable: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return parseEmbeddings(body, input.length);
  }

  async function embed(
    texts: readonly string[],
    purpose: EmbeddingPurpose,
  ): Promise<EmbeddingResult> {
    const prefix = purpose === 'query' ? (settings.queryInstruction ?? '') : '';
    const inputs = prefix ? texts.map((text) => `${prefix}${text}`) : texts;
    const vectors: Float32Array[] = [];
    for (let start = 0; start < inputs.length; start += batchSize) {
      const result = await requestBatch(inputs.slice(start, start + batchSize));
      if (!result.ok) {
        return result;
      }

      vectors.push(...result.vectors);
    }

    const expected = settings.dimensions ?? vectors[0]?.length;
    const wrong = vectors.find((vector) => vector.length !== expected);
    if (wrong) {
      return failure({
        code: 'dimension-mismatch',
        message:
          settings.dimensions === undefined
            ? `${endpoint} returned vectors of different dimensions (${expected} and ${wrong.length}).`
            : `${endpoint} returned ${wrong.length}-dimensional vectors; ${settings.dimensions} are configured.`,
      });
    }

    return { ok: true, vectors };
  }

  return {
    protocol: OPENAI_COMPATIBLE_PROTOCOL,
    model: settings.model,
    dimensions: settings.dimensions,
    embed,
    async probe(): Promise<ProbeResult> {
      const started = now();
      const result = await embed([PROBE_TEXT], 'document');
      const latencyMs = now() - started;

      return result.ok
        ? { ok: true, latencyMs, dimensions: result.vectors[0]!.length }
        : { ok: false, latencyMs, failure: result.failure };
    },
  };
}

function parseEmbeddings(body: unknown, expectedCount: number): EmbeddingResult {
  const malformed = (detail: string) =>
    failure({ code: 'malformed-response', message: `Malformed embeddings response: ${detail}.` });

  if (body === malformedBody) {
    return malformed('the body is not JSON');
  }

  const data = isRecord(body) ? body.data : undefined;
  if (!Array.isArray(data)) {
    return malformed('missing "data" array');
  }

  if (data.length !== expectedCount) {
    return malformed(`expected ${expectedCount} embeddings, got ${data.length}`);
  }

  const vectors = new Array<Float32Array | undefined>(expectedCount);
  for (const [position, item] of data.entries()) {
    const embedding: unknown = isRecord(item) ? item.embedding : undefined;
    const index: unknown = isRecord(item) && item.index !== undefined ? item.index : position;
    if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= expectedCount) {
      return malformed(`invalid index at position ${position}`);
    }

    if (vectors[index as number] !== undefined) {
      return malformed(`duplicate index ${String(index)}`);
    }

    if (
      !Array.isArray(embedding) ||
      embedding.length === 0 ||
      !embedding.every((value) => typeof value === 'number' && Number.isFinite(value))
    ) {
      return malformed(`embedding ${String(index)} is not a non-empty array of numbers`);
    }

    vectors[index as number] = Float32Array.from(embedding as number[]);
  }

  return { ok: true, vectors: vectors as Float32Array[] };
}

/**
 * `{baseUrl}/embeddings`, keeping a query string (for example Azure's `api-version`). Credentials in
 * the URL are rejected: fetch cannot send them and they would leak into messages. `display` (origin
 * and path only) is what failure messages show.
 */
function embeddingsEndpoint(baseUrl: string): { readonly href: string; readonly display: string } {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new TypeError('Embedding baseUrl is not a valid URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError(`Embedding baseUrl must use http or https, got ${url.protocol}`);
  }

  if (url.username || url.password) {
    throw new TypeError(
      'Embedding baseUrl must not contain credentials; pass the token as apiKey.',
    );
  }

  url.pathname = `${url.pathname.replace(/\/+$/u, '')}/embeddings`;

  return { href: url.href, display: `${url.origin}${url.pathname}` };
}

function positiveInteger(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`Embedding ${name} must be a positive integer, got ${value}.`);
  }

  return value;
}

function failure(value: EmbeddingFailure): {
  readonly ok: false;
  readonly failure: EmbeddingFailure;
} {
  return { ok: false, failure: value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
