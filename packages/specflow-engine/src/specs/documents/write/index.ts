/**
 * The effectful half of document writes: reading the Specification, admitting a change before any
 * file is written (plan, limits, Windows path bound, manifest rule, Git preflight with its cache),
 * and the claim source of the document-change journals. The pure model it consumes lives in
 * `../changes`; the writer and the queue build on this.
 */
export * from './admission';
export * from './claim-source';
export * from './folder-revision';
export * from './git-preflight';
export * from './journal-store';
export * from './manifest-dirty';
export * from './path-bound';
export * from './preflight-cache';
export * from './reservation-guard';
export * from './snapshot';
export * from './executor-identity';
export * from './file-effects';
export * from './writer';
export * from './writer-types';
