// The documentation contracts: the CLI's search result and semantic search status (ADR 0020), and
// the Runtime's workspace documentation responses (ADR 0022), which answer the search result's parts
// in their own envelope with paths relative to `docs.root`.

export { DocsCapabilities } from './capabilities';
export * from './search-result';
export * from './semantic-status';
export * from './workspace/shared';
export * from './workspace/tree';
export * from './workspace/article';
export * from './workspace/search';
