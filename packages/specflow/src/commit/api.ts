import {
  DocumentError,
  discoverSpecifications,
  manualCommit,
  readUncommittedScope,
  type ManualCommitCommand,
  type ManualCommitCommandResult,
  type SpecFlowEngine,
  type UncommittedScopeView,
} from '@nevo/specflow-engine';

import { engineAt } from '../engine-at';

/** A Specification the person named by id or by slug. */
export interface ResolvedSpecification {
  readonly specId: string;
  readonly slug: string;
}

/**
 * Every Engine capability the `commit` commands use. The commands depend on this interface only, so a
 * command test can run against a stub and the real binding is one object (below).
 */
export interface CommitEngineApi {
  openEngine(cwd: string, projectRoot?: string): Promise<SpecFlowEngine>;
  /** The Specification a reference (a UUID or a slug) names; an unknown one is `DOCUMENT_NOT_FOUND`. */
  resolveSpecification(engine: SpecFlowEngine, reference: string): Promise<ResolvedSpecification>;
  commit(engine: SpecFlowEngine, command: ManualCommitCommand): Promise<ManualCommitCommandResult>;
  uncommitted(
    engine: SpecFlowEngine,
    command: Pick<ManualCommitCommand, 'scope' | 'specId'>,
  ): Promise<UncommittedScopeView>;
}

/** The binding to the Engine of this installation. The command line may commit the definitions. */
export const engineCommitApi: CommitEngineApi = {
  openEngine: engineAt,
  async resolveSpecification(engine, reference) {
    const lowered = reference.toLowerCase();
    for (const found of await discoverSpecifications(engine)) {
      if (found.status !== 'available') {
        continue;
      }

      if (found.specId.toLowerCase() === lowered || found.specification.slug === reference) {
        return { specId: found.specId, slug: found.specification.slug };
      }
    }

    throw new DocumentError('DOCUMENT_NOT_FOUND', `No Specification "${reference}".`);
  },
  commit: (engine, command) => manualCommit(engine, command, { allowDefinitions: true }),
  uncommitted: (engine, command) =>
    readUncommittedScope(engine, command, { allowDefinitions: true }),
};
