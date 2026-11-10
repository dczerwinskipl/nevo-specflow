export type {
  Chunk,
  ChunkSource,
  SourceUnit,
  UnitMetadata,
  UnitMetadataValue,
} from './chunking/chunk';
export type {
  EmbeddingFailure,
  EmbeddingFailureCode,
  EmbeddingProvider,
  EmbeddingPurpose,
  EmbeddingResult,
  ProbeResult,
} from './embeddings/embedding-provider';
export { PROBE_TEXT } from './embeddings/embedding-provider';
export type {
  ApplyOutcome,
  IndexIdentity,
  IndexManifest,
  ManifestOutcome,
  OpenWriterOutcome,
  StoreUnreadable,
  VectorEntry,
  VectorMatch,
  VectorQuery,
  VectorQueryOutcome,
  VectorStore,
  VectorStoreChange,
  VectorStoreWriter,
} from './indexing/vector-store/vector-store';
export {
  CHUNKER_VERSION,
  CHUNK_MAX_CHARS,
  CHUNK_OVERLAP_CHARS,
  chunkMarkdownUnit,
} from './chunking/markdown-chunker';
export {
  DEFAULT_EMBEDDING_BATCH_SIZE,
  DEFAULT_EMBEDDING_TIMEOUT_MS,
  OPENAI_COMPATIBLE_PROTOCOL,
  createOpenAiCompatibleEmbeddingProvider,
  type OpenAiCompatibleEmbeddingDependencies,
  type OpenAiCompatibleEmbeddingSettings,
} from './embeddings/openai-compatible-embeddings';
export {
  createFileVectorStore,
  inspectFileStoreWriter,
  type FileVectorStoreOptions,
} from './indexing/vector-store/file-store/file-vector-store';
export { FILE_INDEX_SCHEMA_VERSION } from './indexing/vector-store/file-store/manifest-file';
export type {
  WriterLockDependencies,
  WriterLockState,
} from './indexing/vector-store/file-store/writer-lock';
export { planRefresh, type RefreshPlan } from './indexing/refresh/plan-refresh';
export {
  REFRESH_COMMIT_CHUNKS,
  refreshIndex,
  type RefreshOutcome,
  type RefreshProgress,
  type RefreshRequest,
} from './indexing/refresh/refresh-index';
export {
  SEARCH_REASON,
  VECTOR_CANDIDATES_PER_RESULT,
  createSearchEngine,
  type ChunkHit,
  type SearchEngine,
  type SearchReason,
  type SearchRequest,
  type SearchResult,
  type SearchVectors,
  type UnitHit,
} from './search/search';
export { RRF_K, reciprocalRankFusion } from './ranking/rrf';
export { sameIdentity, validateChange } from './indexing/vector-store/vector-store';
export {
  cosineSimilarity,
  nearestNeighbours,
  type VectorCandidate,
} from './indexing/vector-store/vector-math';
