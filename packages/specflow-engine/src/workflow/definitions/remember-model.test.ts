import { describe, expect, it } from 'vitest';

import { setArchetypeProviderModel } from './remember-model';

const SOURCE = `kind: agent-archetype
schemaVersion: 1
id: reviewer
title: Reviewer
description: Reviews.
# Codex reviews by default.
preferredProvider: codex
providers:
  - provider: codex
  - provider: claude
    model: claude-opus-5-5
`;

describe('setArchetypeProviderModel', () => {
  it('fills the missing model of a listed provider and keeps comments', () => {
    const next = setArchetypeProviderModel(SOURCE, { provider: 'codex', model: 'gpt-x' });

    expect(next).toContain('# Codex reviews by default.');
    expect(next).toContain('  - provider: codex\n    model: gpt-x\n');
  });

  it('adds an unlisted provider and can make it the preferred one', () => {
    const next = setArchetypeProviderModel(SOURCE, {
      provider: 'antigravity',
      model: 'gemini-x',
      prefer: true,
    });

    expect(next).toContain('preferredProvider: antigravity');
    expect(next).toContain('  - provider: antigravity\n    model: gemini-x\n');
  });

  it('refuses an invalid provider and a file it cannot edit', () => {
    expect(() => setArchetypeProviderModel(SOURCE, { provider: 'Bad Id', model: 'x' })).toThrow(
      expect.objectContaining({ code: 'WORKFLOW_INPUT_INVALID' }),
    );
    expect(() =>
      setArchetypeProviderModel('kind: agent-archetype\n', { provider: 'codex', model: 'x' }),
    ).toThrow(expect.objectContaining({ code: 'WORKFLOW_INPUT_INVALID' }));
  });
});
