import { randomUUID } from 'node:crypto';
import type {
  DemoCatalogue,
  DemoDocumentOperationInput,
  DemoDocumentOperationResult,
  DemoDocumentsInput,
  DemoDocumentsResult,
  DemoFolderInput,
  DemoError,
  DemoLocation,
  DemoSessionInput,
  DemoSessionDetail,
  DemoSessionResult,
} from '@nevo/specflow-contracts/demo';
import type { CurrentSpecRecord } from '../features/specs';
import { creationCatalogue } from './catalogue';

/**
 * The one shared in-memory demo environment (one per Runtime). It holds data and the few
 * invariants every demo module relies on (idempotent requests, failure injection, catalogue
 * revision); operations, validation and endpoints belong to the feature module that owns them
 * (documents, sessions, specs) and receive this state by injection.
 */
export class DemoOperationError extends Error {
  readonly status: 400 | 404 | 409 | 503;
  readonly code: DemoError['error'];
  constructor(status: 400 | 404 | 409 | 503, code: DemoError['error']) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export interface DemoDocument {
  id: string;
  title: string;
  filename?: string;
  content: string;
  revision: string;
  required?: boolean;
}

export interface CreatedDemoSpecification {
  record: CurrentSpecRecord;
  archetype: string;
  documents: Map<string, DemoDocument>;
  folders: string[];
  requiredPaths: string[];
  treeRevision: string;
  location: DemoLocation;
  /** Workspace the specification was created in (demo registry). */
  workspaceId: string;
  branch?: string;
  slug: string;
  integrationTargetWorkspaceId?: string;
}

export type DemoFailureStage = 'create' | 'session' | 'save';

export interface DemoStateOptions {
  catalogue?: DemoCatalogue;
  fail?: (stage: DemoFailureStage) => boolean;
  id?: () => string;
  now?: () => string;
  /** Workspace UUID factory (tests). */
  uuid?: () => string;
  /**
   * Accept the `demoScenario` / `x-demo-scenario` seam. Default OFF: a normal demo ignores the
   * param and header silently. Enable only for isolated scenario environments and tests.
   */
  scenarios?: boolean;
}

type RequestInput =
  DemoSessionInput | DemoDocumentsInput | DemoFolderInput | DemoDocumentOperationInput;
type RequestResult = DemoSessionResult | DemoDocumentsResult | DemoDocumentOperationResult;

/** Stable recursive keys retain nested document fields in idempotency fingerprints. */
export function fingerprintInput(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(fingerprintInput).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([name, item]) => JSON.stringify(name) + ':' + fingerprintInput(item))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}

export function createDemoState(options: DemoStateOptions = {}) {
  const catalogue = structuredClone(options.catalogue ?? creationCatalogue);
  const specifications = new Map<string, CreatedDemoSpecification>();
  const sessions = new Map<string, DemoSessionDetail>();
  const locations = new Map<string, DemoLocation>();
  const requests = new Map<string, { fingerprint: string; result?: RequestResult }>();
  return {
    scenarioSeam: options.scenarios ?? false,
    catalogue,
    /** Specifications created in this environment (owned by specs; documents live inside). */
    specifications,
    /** Sessions allocated in this environment (owned by sessions). */
    sessions,
    locations,
    id: options.id ?? randomUUID,
    uuid: options.uuid ?? randomUUID,
    now: () => options.now?.() ?? new Date().toISOString(),
    fail: (stage: DemoFailureStage, code: DemoError['error']) => {
      if (options.fail?.(stage)) throw new DemoOperationError(503, code);
    },
    stale: (revision: string) => {
      if (revision !== catalogue.revision)
        throw new DemoOperationError(409, 'demo_catalogue_stale');
    },
    /** Idempotent request entry: same key + same input replays, same key + other input conflicts. */
    request(subject: string, operation: string, input: RequestInput) {
      const key = JSON.stringify([subject, operation, input.requestId]);
      const fingerprint = fingerprintInput(input);
      const previous = requests.get(key);
      if (previous && previous.fingerprint !== fingerprint)
        throw new DemoOperationError(409, 'demo_request_conflict');
      if (previous) return previous;
      const entry: { fingerprint: string; result?: RequestResult } = { fingerprint };
      requests.set(key, entry);
      return entry;
    },
  };
}
export type DemoState = ReturnType<typeof createDemoState>;
