/**
 * The Engine-owned scheduler of the document commit queue (ADR 0016 decisions 9, 16 and 18): timers,
 * the 30-second sweep, the startup pass and the shutdown flush. A host (the Runtime on startup)
 * creates one per Engine and starts it; the one-shot CLI commands do not start one and drain the
 * queue explicitly. No transport, no Fastify, no process signals: the host owns those and calls
 * `stop({ flush: true })`.
 */
export {
  DOCUMENT_SHUTDOWN_DEADLINE_MS,
  DOCUMENT_SWEEP_MS,
  createDocumentQueueScheduler,
  disabledDocumentQueueScheduler,
} from './scheduler';
export type {
  DocumentQueueScheduler,
  SchedulerEvent,
  SchedulerOptions,
  SchedulerStopOptions,
  SchedulerStopOutcome,
} from './scheduler';
export { notifyDocumentChangeApplied, onDocumentChangeApplied } from './notifier';
export type { DocumentChangeNotice } from './notifier';
export { takeOverDocumentQueue } from './operator';
export type { DocumentQueueTakeoverOptions, DocumentQueueTakeoverResult } from './operator';
