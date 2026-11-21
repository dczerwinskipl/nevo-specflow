import { describe, expect, it } from 'vitest';

import type { DefinitionIssue } from '../../specs/definitions/kind-registry';
import { agentArchetypeKind } from './kinds';
import type { AgentArchetype } from './model';

const archetype = (allow: string[]): AgentArchetype => ({
  id: 'reviewer',
  title: 'Reviewer',
  description: 'Reviews.',
  providers: [{ provider: 'claude', model: 'm', permissions: { allow } }],
});

const check = (allow: string[]) =>
  agentArchetypeKind.check(archetype(allow), {
    lookup: () => ({ state: 'missing' }),
  }) as DefinitionIssue[];

describe('agent archetype permission rules (D20)', () => {
  it('accepts read-only tools and product CLI commands', () => {
    expect(check(['Read(src/**)', 'Grep(docs/**)', 'Bash(nevo-specflow tasks list *)'])).toEqual(
      [],
    );
  });

  it('refuses over-broad rules at load, naming the rule location', () => {
    expect(check(['Read(src/**)', 'Bash(*)', 'WRITE'])).toEqual([
      expect.objectContaining({ location: '/providers/0/permissions/allow/1' }),
      expect.objectContaining({ location: '/providers/0/permissions/allow/2' }),
    ]);
  });

  it('leaves syntax it does not recognise to the Runtime, which ignores and reports it', () => {
    expect(check(['Weird(x)'])).toEqual([]);
  });
});
