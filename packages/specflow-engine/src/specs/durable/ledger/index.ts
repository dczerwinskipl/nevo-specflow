// The uncommitted-changes ledger (ADR 0018): generic, owner-keyed, durable. It imports neither the
// Create nor the documents slice and knows no Git (callers pass a probe).
export * from './codec';
export * from './model';
export * from './prune';
export * from './revision';
export * from './store';
export * from './upsert';
