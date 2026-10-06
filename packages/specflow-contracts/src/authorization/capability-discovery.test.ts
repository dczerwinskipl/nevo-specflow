import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import { SpecCapabilities } from '../specs';
import { SettingsCapabilities } from '../settings';
import {
  createCapabilityDiscoveryRequestSchema,
  createCapabilityDiscoveryResponseSchema,
  type CapabilityDiscoveryResponseFor,
} from './capability-discovery';

const authorizationResources = [SpecCapabilities, SettingsCapabilities] as const;
const requestSchema = createCapabilityDiscoveryRequestSchema(authorizationResources);
const responseSchema = createCapabilityDiscoveryResponseSchema(authorizationResources);

describe('capability discovery contracts', () => {
  it('builds the accepted resource names from the supplied feature catalogue', () => {
    expect(
      Value.Check(requestSchema, {
        resource: { name: 'spec', scope: { specId: 'S1' } },
      }),
    ).toBe(true);

    expect(
      Value.Check(requestSchema, {
        resource: { name: 'session' },
      }),
    ).toBe(false);
  });

  it('keeps each supplied resource response exact', () => {
    expect(
      Value.Check(responseSchema, {
        resource: { name: 'spec', scope: { specId: 'S1' } },
        capabilities: { view: true, create: false, manage: true },
      }),
    ).toBe(true);

    expect(
      Value.Check(responseSchema, {
        resource: { name: 'settings', scope: {} },
        capabilities: { view: true, manage: true, create: false },
      }),
    ).toBe(false);
  });

  it('keeps a feature-specific response type without a central resource union', () => {
    const response: CapabilityDiscoveryResponseFor<typeof SpecCapabilities> = {
      resource: { name: 'spec', scope: {} },
      capabilities: { view: true, create: false, manage: false },
    };

    expect(response.capabilities.manage).toBe(false);
  });
});
