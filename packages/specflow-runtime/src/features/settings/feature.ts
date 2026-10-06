import { SettingsCapabilities } from '@nevo/specflow-contracts/settings';

import type { RuntimeFeature } from '../runtime-feature';

export function createSettingsFeature(): RuntimeFeature {
  return {
    authorizationResources: [SettingsCapabilities],
  };
}
