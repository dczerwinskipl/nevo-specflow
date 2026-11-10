// Public surface of @nevo/specflow-docs (ADR 0020): what the product shell, Runtime and this
// repository's `tools/docs` launcher consume. The Commander adapter is the `./cli` export.

export * from './errors';
export { asString, parseFrontmatter, type DocRecord } from './frontmatter/contract';
export { validateDoc } from './frontmatter/validate';
export { DEFAULT_DOCS_SETTINGS } from './config/docs-settings';
export { parseDocsConfiguration, type DocsConfiguration } from './config/docs-configuration';
export { loadDocsSettings } from './config/load-docs-settings';
export { initDocs } from './init/docs-init';
export {
  inspectCorpus,
  openFileSystemCorpus,
  type DocsCorpus,
  type DocsCorpusRules,
} from './corpus/corpus';
export { buildIndex } from './validation/generated-index';
export {
  openDocsSearch,
  searchDocumentation,
  type DocsSearch,
  type DocsSearchRequest,
} from './semantic/docs-search';
export { openDocsIndex, type DocsIndex } from './semantic/docs-index';
export { type CreateEmbeddingProvider } from './semantic/embedding-providers';
export { buildDocsIndex, type SemanticIndexResult } from './semantic/semantic-index';
