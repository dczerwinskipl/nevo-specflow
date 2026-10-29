import { sha256Hex } from '../../../hash';
import type { ManifestDocument, SpecificationManifest } from '../../model';
import { parseSpecificationManifestText } from '../../model';
import { serializeSpecificationManifest } from '../../manifest-serializer';
import type { DocumentChangeJournal } from './journal/model';
import type { DocumentChangeStage } from './journal/stages';
import type { ObservedFile, PlanningSnapshot } from './plan/snapshot';

export const TEST_SPEC_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
export const TEST_WORKSPACE_ID = '11111111-2222-4333-8444-555555555555';
export const TEST_PROJECT_ID = '99999999-8888-4777-8666-555555555555';
export const TEST_SLUG = 'sample-spec';

export interface SnapshotFile {
  readonly path: string;
  readonly content: string;
}

export interface SnapshotInput {
  readonly documents?: readonly ManifestDocument[];
  readonly folders?: readonly string[];
  /** Files on disk besides the manifest; registered documents without an entry here are dangling. */
  readonly files?: readonly SnapshotFile[];
  readonly location?: 'active' | 'archive';
}

export function observed(path: string, content: string): ObservedFile {
  const sha256 = sha256Hex(content);

  return { path, revision: sha256, sha256, bytes: Buffer.byteLength(content, 'utf8') };
}

/** A Specification with the overview, plus whatever the test adds. Pure; nothing is written. */
export function buildSnapshot(input: SnapshotInput = {}): PlanningSnapshot {
  const documents: ManifestDocument[] = [
    { id: 'overview', path: 'overview.md', type: 'overview' },
    ...(input.documents ?? []),
  ];
  const location = input.location ?? 'active';
  const manifest: SpecificationManifest = {
    specId: TEST_SPEC_ID,
    slug: TEST_SLUG,
    title: 'Sample',
    archetype: {
      id: 'feature',
      version: 1,
      requirements: [{ documentType: 'overview', minCount: 1 }],
    },
    documents,
    folders: [...(input.folders ?? [])],
    status: 'draft',
    location,
    tasks: [],
  };
  const manifestText = serializeSpecificationManifest(manifest);
  const files = input.files ?? [{ path: 'overview.md', content: '# Overview\n' }];

  return {
    manifest: parseSpecificationManifestText(manifestText, TEST_SLUG, location),
    manifestText,
    files: files.map((file) => observed(file.path, file.content)),
  };
}

export const TEST_OPERATION_ID = '3f2b8a40-5c1d-4e7a-9b62-0d4e8f1a7c35';
export const TEST_BATCH_ID = TEST_OPERATION_ID;
export const TEST_HEAD = 'a'.repeat(40);
export const TEST_NOW = '2026-10-24T10:00:00.000Z';
export const TEST_LATER = '2026-10-24T10:00:05.000Z';

export const TEST_CONTEXT = { project: { projectId: TEST_PROJECT_ID } };

export const TEST_EXECUTOR = {
  pid: 4242,
  hostId: 'host-1',
  pidNamespaceId: '4026531836',
  processStartTime: '123456',
  bootId: 'boot-1',
};

/** A valid journal in `stage` with the fields that stage needs; `overrides` replace any field. */
export function buildJournal(
  stage: DocumentChangeStage,
  overrides: Partial<Record<keyof DocumentChangeJournal, unknown>> = {},
): DocumentChangeJournal {
  const writing = stage === 'reserved' || stage === 'files-writing';
  const acknowledged = stage === 'queued' || stage === 'committing' || stage === 'commit-failed';
  const base: Record<string, unknown> = {
    version: 1,
    projectId: TEST_PROJECT_ID,
    operationId: TEST_OPERATION_ID,
    specId: TEST_SPEC_ID,
    slug: TEST_SLUG,
    workspaceId: TEST_WORKSPACE_ID,
    workspaceRoot: '/work/checkout',
    action: 'save',
    inputFingerprint: 'c'.repeat(64),
    sequence: 7,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    stage,
    plan: { sha256: 'd'.repeat(64), bytes: 900, pathCount: 1, documentCount: 1 },
    commit: { branch: 'main' },
    attempts: 0,
    ...(writing ? { executor: TEST_EXECUTOR } : {}),
    ...(acknowledged || stage === 'completed' ? { queuedAt: TEST_NOW } : {}),
    ...(stage === 'committing' || stage === 'commit-failed' ? { batchId: TEST_BATCH_ID } : {}),
    ...(stage === 'recovery-required' ? { recoveryPhase: 'commit' } : {}),
    ...(stage === 'failed' || stage === 'commit-failed' || stage === 'recovery-required'
      ? { reason: 'some-reason' }
      : {}),
    ...(stage === 'completed'
      ? { outcome: 'committed', sha: 'b'.repeat(40), settledAt: TEST_LATER }
      : {}),
  };

  return { ...base, ...overrides } as unknown as DocumentChangeJournal;
}
