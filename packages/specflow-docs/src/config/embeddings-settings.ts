// The `ai.embeddings` configuration namespace (ADR 0020, architecture.runtime.configuration). It may
// appear in the project and in the local file; the local value wins per key. Secrets are never read
// from configuration: `apiKeyEnv` names the environment variable that holds the key, and a key that
// looks like a literal secret is rejected. This parser is file-free; `parseDocsConfiguration` is the
// entry point the `docs` command and Runtime config loading share.

import { DocsConfigError } from '../errors';
import { onlyKeys, record, type ConfigRecord } from './values';

/** The only embedding protocol; further protocols are further adapters (ADR 0021). */
export const EMBEDDINGS_PROTOCOLS = ['openai-compatible'] as const;
export type EmbeddingsProtocol = (typeof EMBEDDINGS_PROTOCOLS)[number];
/** `ai.embeddings.protocol` when neither file sets it. */
export const DEFAULT_EMBEDDINGS_PROTOCOL: EmbeddingsProtocol = 'openai-compatible';

/** A resolved embedding endpoint. Absent optional keys use the adapter defaults. */
export interface EmbeddingsSettings {
  readonly protocol: EmbeddingsProtocol;
  /** `http` or `https` base URL; `/embeddings` is appended. */
  readonly baseUrl: string;
  readonly model: string;
  readonly dimensions?: number;
  /** Name of the environment variable holding the API key, read when the endpoint is called. */
  readonly apiKeyEnv?: string;
  /** Prefix for query texts only (instruction-tuned models). */
  readonly queryInstruction?: string;
  readonly batchSize?: number;
  /** Per request, in milliseconds. */
  readonly timeoutMs?: number;
}

const EMBEDDINGS_KEYS = new Set([
  'protocol',
  'baseUrl',
  'model',
  'dimensions',
  'apiKeyEnv',
  'queryInstruction',
  'batchSize',
  'timeoutMs',
]);

/** Keys that would hold a secret value; named explicitly so the error says what to do instead. */
const SECRET_KEY =
  /^(?:api[-_]?key|key|token|access[-_]?token|secret|password|authorization|bearer)$/i;

/** Upper-case environment variable names; a literal key (mixed case, `-`, `.`) never matches. */
const ENV_VAR_NAME = /^[A-Z_][A-Z0-9_]*$/;

const POSITIVE_INTEGER_KEYS = new Set(['dimensions', 'batchSize', 'timeoutMs']);

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '' || value !== value.trim()) {
    throw new DocsConfigError(`${path} must be a non-empty string without surrounding spaces.`);
  }

  return value;
}

function baseUrl(value: unknown, path: string): string {
  const text = nonEmptyString(value, path);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new DocsConfigError(`${path} must be an absolute http or https URL (got '${text}').`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new DocsConfigError(`${path} must be an absolute http or https URL (got '${text}').`);
  }

  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new DocsConfigError(
      `${path} must not contain credentials, a query or a fragment; name the API key's environment variable in ai.embeddings.apiKeyEnv.`,
    );
  }

  return text;
}

/** Validate one file's `ai.embeddings` keys; the merged result is checked for completeness later. */
function embeddingsLayer(value: unknown): ConfigRecord {
  const layer = record(value, 'ai.embeddings');
  for (const key of Object.keys(layer)) {
    if (SECRET_KEY.test(key)) {
      throw new DocsConfigError(
        `ai.embeddings.${key}: secrets are never read from configuration; put the API key in an environment variable and name it in ai.embeddings.apiKeyEnv.`,
      );
    }
  }

  onlyKeys(layer, EMBEDDINGS_KEYS, 'ai.embeddings');

  for (const [key, entry] of Object.entries(layer)) {
    const path = `ai.embeddings.${key}`;
    if (POSITIVE_INTEGER_KEYS.has(key)) {
      if (typeof entry !== 'number' || !Number.isInteger(entry) || entry <= 0) {
        throw new DocsConfigError(`${path} must be a positive integer.`);
      }
    } else if (key === 'protocol') {
      if (!(EMBEDDINGS_PROTOCOLS as readonly unknown[]).includes(entry)) {
        throw new DocsConfigError(
          `${path} must be one of: ${EMBEDDINGS_PROTOCOLS.join(', ')} (got ${JSON.stringify(entry)}).`,
        );
      }
    } else if (key === 'baseUrl') {
      baseUrl(entry, path);
    } else if (key === 'apiKeyEnv') {
      if (typeof entry !== 'string' || !ENV_VAR_NAME.test(entry)) {
        throw new DocsConfigError(
          `${path} must be the name of an environment variable (upper-case letters, digits and '_'), not the API key itself.`,
        );
      }
    } else {
      nonEmptyString(entry, path);
    }
  }

  return layer;
}

/** The `ai.embeddings` value of one file's top level, if any; other `ai` keys are not read. */
export function embeddingsSection(topLevel: ConfigRecord | undefined): unknown {
  if (topLevel?.ai === undefined) {
    return undefined;
  }

  return record(topLevel.ai, 'ai').embeddings;
}

/** Validate one file's `ai.embeddings` value; throws `DocsConfigError` naming the key. */
export function parseEmbeddingsLayer(value: unknown): ConfigRecord | undefined {
  return value === undefined ? undefined : embeddingsLayer(value);
}

/**
 * Merge validated layers (local wins per key) and require a complete endpoint; `undefined` means no
 * endpoint is configured.
 */
export function mergeEmbeddingsLayers(
  project: ConfigRecord | undefined,
  local: ConfigRecord | undefined,
): EmbeddingsSettings | undefined {
  if (project === undefined && local === undefined) {
    return undefined;
  }

  const merged: ConfigRecord = { protocol: DEFAULT_EMBEDDINGS_PROTOCOL, ...project, ...local };
  for (const key of ['baseUrl', 'model'] as const) {
    if (merged[key] === undefined) {
      throw new DocsConfigError(
        `ai.embeddings.${key} is required when ai.embeddings is configured (in either file).`,
      );
    }
  }

  return merged as unknown as EmbeddingsSettings;
}
