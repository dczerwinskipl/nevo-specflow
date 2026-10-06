import { SessionCapabilities } from '@nevo/specflow-contracts/sessions';

import type { RuntimeFeature } from '../runtime-feature';

export function createSessionsFeature(): RuntimeFeature {
  return {
    authorizationResources: [SessionCapabilities],
  };
}
