import { describe, expect, it } from 'vitest';
import { DocsCapabilities } from '../features/docs';
import { SessionCapabilities } from '../features/sessions';
import { SpecCapabilities } from '../features/specs';
import { WorkspaceCapabilities } from '../features/workspaces';
import { specFlowRoleCapabilities } from './roles';

const start = SpecCapabilities.capabilities.StartSession;

describe('built-in role capabilities', () => {
  it('grants spec.start-session to developer and admin, never to viewer', () => {
    const roles = specFlowRoleCapabilities();
    expect(roles.developer).toContain(start);
    expect(roles.admin).toContain(start);
    expect(roles.viewer).not.toContain(start);
  });

  it('gives viewer the read capabilities only and every role a superset of the one below it', () => {
    const roles = specFlowRoleCapabilities();
    expect([...roles.viewer].sort()).toEqual(
      [
        SpecCapabilities.capabilities.View,
        SessionCapabilities.capabilities.View,
        DocsCapabilities.capabilities.View,
        WorkspaceCapabilities.capabilities.View,
      ].sort(),
    );
    expect(roles.developer).toEqual(expect.arrayContaining([...roles.viewer]));
    expect(roles.admin).toEqual(expect.arrayContaining([...roles.developer]));
    expect(roles.developer).not.toContain(SessionCapabilities.capabilities.ViewProviderLimits);
  });

  it('gives every role docs.view and workspace.view (no docs.search alias)', () => {
    const roles = specFlowRoleCapabilities();
    expect(DocsCapabilities.capabilities).toEqual({ View: 'docs.view' });
    expect(WorkspaceCapabilities.capabilities).toEqual({ View: 'workspace.view' });
    for (const role of [roles.viewer, roles.developer, roles.admin]) {
      expect(role).toContain('docs.view');
      expect(role).toContain('workspace.view');
      expect(role).not.toContain('docs.search');
    }
  });
});
