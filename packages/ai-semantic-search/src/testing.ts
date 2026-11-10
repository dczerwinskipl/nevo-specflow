/**
 * Test doubles for consumers of the engine (deterministic, no network, no files) and the file
 * store's test seam.
 */
export {
  FAKE_EMBEDDING_PROTOCOL,
  createFakeEmbeddingProvider,
  type FakeEmbeddingCall,
  type FakeEmbeddingOptions,
  type FakeEmbeddingProvider,
} from './embeddings/fake-embedding-provider';
export { createInMemoryVectorStore } from './indexing/vector-store/in-memory-vector-store';
export { createCheckpointedFileVectorStore } from './indexing/vector-store/file-store/file-vector-store';
export type {
  WriterLockCheckpoint,
  WriterLockStep,
} from './indexing/vector-store/file-store/writer-lock';
