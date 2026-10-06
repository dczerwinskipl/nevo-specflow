import type { CurrentSpecSectionId } from '@nevo/specflow-contracts/specs/overview';

import { onlyKeys, record } from '../../config/parsing/value-parsers';
import {
  DEFAULT_CURRENT_SECTIONS,
  parseCurrentOverviewSections,
} from './overview/current/configuration';

export interface SpecsFeatureConfig {
  readonly overview: {
    readonly current: {
      readonly sections: readonly CurrentSpecSectionId[];
    };
  };
}

export function parseSpecsFeatureConfig(value: unknown): SpecsFeatureConfig {
  if (value === undefined) return defaultSpecsFeatureConfig();

  const specs = record(value, 'specs');
  onlyKeys(specs, new Set(['overview']), 'specs');

  const overview =
    specs.overview === undefined ? undefined : record(specs.overview, 'specs.overview');
  if (overview) {
    onlyKeys(overview, new Set(['current']), 'specs.overview');
  }

  const current =
    overview?.current === undefined
      ? undefined
      : record(overview.current, 'specs.overview.current');
  if (current) {
    onlyKeys(current, new Set(['sections']), 'specs.overview.current');
  }

  return {
    overview: {
      current: {
        sections: parseCurrentOverviewSections(current?.sections),
      },
    },
  };
}

export function defaultSpecsFeatureConfig(): SpecsFeatureConfig {
  return {
    overview: {
      current: {
        sections: [...DEFAULT_CURRENT_SECTIONS],
      },
    },
  };
}
