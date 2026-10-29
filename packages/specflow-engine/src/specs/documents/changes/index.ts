/**
 * Pure model of document changes (planners, journal, batch and lease records, codecs, fingerprint,
 * claims, error mapping, per-path inspection). Nothing here touches the filesystem, Git or HTTP: the
 * writer, the queue and the Runtime consume it. Imports no Create, definitions or Runtime code.
 */
export * from './claims';
export * from './commit-info';
export * from './errors';
export * from './fingerprint';
export * from './inspection';
export * from './journal';
export * from './limits';
export * from './plan';
export * from './queue-capacity';
