import { describe, expect, it } from 'vitest';
import { SessionCapabilities } from '../features/sessions';
import { SpecCapabilities } from '../features/specs';
import { specFlowRoleCapabilities } from './roles';

const start = SpecCapabilities.capabilities.StartSession;

describe('built-in role capabilities', () => {
  it('grants spec.start-session to developer and admin, never to viewer', () => {
    const roles = specFlowRoleCapabilities();
    expect(roles.developer).toContain(start);
    expect(roles.admin).toContain(start);
    expect(roles.viewer).not.toContain(start);
  });

  it('keeps viewer unchanged and every role a superset of the one below it', () => {
    const roles = specFlowRoleCapabilities();
    expect([...roles.viewer].sort()).toEqual(
      [SpecCapabilities.capabilities.View, SessionCapabilities.capabilities.View].sort(),
    );
    expect(roles.developer).toEqual(expect.arrayContaining([...roles.viewer]));
    expect(roles.admin).toEqual(expect.arrayContaining([...roles.developer]));
    expect(roles.developer).not.toContain(SessionCapabilities.capabilities.ViewProviderLimits);
  });
});
