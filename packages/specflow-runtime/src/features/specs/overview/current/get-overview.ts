import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import type {
  CurrentSpecOverviewItem,
  CurrentSpecSectionId,
  CurrentSpecsOverview,
} from '@nevo/specflow-contracts/specs/overview';

import type { RequestAuthorization } from '../../../auth';
import type { SpecsOverviewRepository } from '../repository/read-repository';
import type { CurrentSpecRecord } from '../repository/model';
import { filterAuthorizedSpecs } from '../filter-authorized-specs';
import { classifyCurrentSpec } from './classify-spec';

export interface GetCurrentOverviewDependencies {
  readonly authorization: RequestAuthorization;
  readonly repository: SpecsOverviewRepository;
  readonly sections: readonly CurrentSpecSectionId[];
}

export async function getCurrentOverview(
  dependencies: GetCurrentOverviewDependencies,
): Promise<CurrentSpecsOverview> {
  dependencies.authorization.requireCapabilityInAnyScope({
    resource: SpecCapabilities,
    capability: SpecCapabilities.capabilities.View,
  });

  const snapshot = await dependencies.repository.readCurrent();
  const visible = filterAuthorizedSpecs(dependencies.authorization, snapshot.items);
  const items = visible
    .map(toOverviewItem)
    .filter((item) => dependencies.sections.includes(item.classification.section));

  return {
    revision: snapshot.revision,
    collection: 'current',
    sections: [...dependencies.sections],
    items,
  };
}

function toOverviewItem(spec: CurrentSpecRecord): CurrentSpecOverviewItem {
  return {
    id: spec.id,
    title: spec.title,
    ...(spec.key === undefined ? {} : { key: spec.key }),
    ...(spec.pullRequests === undefined ? {} : { pullRequests: [...spec.pullRequests] }),
    ...(spec.tags === undefined ? {} : { tags: [...spec.tags] }),
    updatedAt: spec.updatedAt,
    progress: spec.progress,
    classification: classifyCurrentSpec(spec),
    signals: spec.signals.map((signal) => ({ ...signal })),
    currentExecutions: spec.currentExecutions.map((execution) => ({
      ...execution,
      taskIds: [...execution.taskIds],
    })),
  };
}
