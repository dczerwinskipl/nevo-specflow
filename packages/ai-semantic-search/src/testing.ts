/** Test doubles for consumers of the engine: deterministic, no network, no files. */
export {
  FAKE_EMBEDDING_PROTOCOL,
  createFakeEmbeddingProvider,
  type FakeEmbeddingCall,
  type FakeEmbeddingOptions,
  type FakeEmbeddingProvider,
} from './embeddings/fake-embedding-provider';
export { createInMemoryVectorStore } from './indexing/vector-store/in-memory-vector-store';
