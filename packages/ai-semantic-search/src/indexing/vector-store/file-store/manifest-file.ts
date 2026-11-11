import type { IndexIdentity } from '../vector-store';

/** Version of the on-disk format. Another version is read as `missing`, so the index is rebuilt. */
export const FILE_INDEX_SCHEMA_VERSION = 2;

/** One vector per manifest chunk; `offset` is the chunk's vector index in the vectors file. */
export interface StoredChunk {
  readonly id: string;
  readonly contentHash: string;
  readonly offset: number;
}

/** The JSON content of a manifest file. */
export interface StoredManifest {
  readonly schemaVersion: typeof FILE_INDEX_SCHEMA_VERSION;
  readonly generation: number;
  readonly identity: IndexIdentity;
  readonly chunks: readonly StoredChunk[];
  /** `IndexManifest.probe`, one number per dimension. */
  readonly probe?: readonly number[];
}

/** Boundary validation of a manifest file; anything else than a consistent manifest is absent. */
export function parseManifest(text: string, generation: number): StoredManifest | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }

  if (
    !isRecord(value) ||
    value.schemaVersion !== FILE_INDEX_SCHEMA_VERSION ||
    value.generation !== generation ||
    !isIdentity(value.identity) ||
    !Array.isArray(value.chunks)
  ) {
    return undefined;
  }

  const { identity, chunks, probe } = value;
  if (
    probe !== undefined &&
    (!Array.isArray(probe) ||
      probe.length !== identity.dimensions ||
      !probe.every((entry) => typeof entry === 'number' && Number.isFinite(entry)))
  ) {
    return undefined;
  }

  const ids = new Set<string>();
  const offsets = new Set<number>();
  for (const chunk of chunks as unknown[]) {
    if (
      !isRecord(chunk) ||
      typeof chunk.id !== 'string' ||
      typeof chunk.contentHash !== 'string' ||
      !Number.isInteger(chunk.offset) ||
      (chunk.offset as number) < 0 ||
      (chunk.offset as number) >= chunks.length ||
      ids.has(chunk.id) ||
      offsets.has(chunk.offset as number)
    ) {
      return undefined;
    }

    ids.add(chunk.id);
    offsets.add(chunk.offset as number);
  }

  return {
    schemaVersion: FILE_INDEX_SCHEMA_VERSION,
    generation,
    identity: {
      chunkerVersion: identity.chunkerVersion,
      protocol: identity.protocol,
      model: identity.model,
      space: identity.space,
      dimensions: identity.dimensions,
    },
    chunks: chunks as StoredChunk[],
    ...(probe === undefined ? {} : { probe: probe as number[] }),
  };
}

function isIdentity(value: unknown): value is IndexIdentity {
  return (
    isRecord(value) &&
    Number.isInteger(value.chunkerVersion) &&
    typeof value.protocol === 'string' &&
    typeof value.model === 'string' &&
    typeof value.space === 'string' &&
    Number.isInteger(value.dimensions) &&
    (value.dimensions as number) > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
