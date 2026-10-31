import { describe, expect, it } from 'vitest';
import { antigravityArguments, antigravityMode, antigravityModels } from './discovery';

const selection = { providerId: 'antigravity', mode: 'workspace-write' } as const;

describe('Antigravity native selection', () => {
  it('defaults to Agent and keeps native Plan separate from read-only authority', () => {
    expect(antigravityMode(selection).nativeMode).toBe('accept-edits');
    expect(antigravityMode({ ...selection, providerModeId: 'plan' })).toMatchObject({
      nativeMode: 'plan',
      mode: 'workspace-write',
    });
    expect(() => antigravityMode({ ...selection, mode: 'read-only' })).toThrow();
    expect(() => antigravityMode({ ...selection, providerModeId: 'always-proceed' })).toThrow();
  });

  it('resumes only the exact native context and preserves separate literal arguments', () => {
    const args = antigravityArguments(
      { ...selection, modelId: 'fixture-model', effort: 'low' },
      { nativeSessionId: 'original-context', resume: true },
    );
    expect(args).toContain('--disable-slash-commands');
    expect(args).toContain('--sandbox');
    expect(args.slice(-6)).toEqual([
      '--conversation',
      'original-context',
      '--model',
      'fixture-model',
      '--effort',
      'low',
    ]);
    expect(args).not.toContain('--continue');
    expect(args).not.toContain('--dangerously-skip-permissions');
    expect(
      antigravityArguments(selection, { nativeSessionId: 'reservation', resume: false }),
    ).not.toContain('--conversation');
    expect(() =>
      antigravityArguments(selection, { nativeSessionId: '../other', resume: true }),
    ).toThrow();
  });
});

describe('Antigravity native model catalogue', () => {
  it('reads native rows without guessing per-model effort support', () => {
    expect(
      antigravityModels('Fetching models...\nfixture-one\tFixture One\nfixture-two  Fixture Two\n'),
    ).toEqual([
      { modelId: 'fixture-one', title: 'Fixture One', efforts: [] },
      { modelId: 'fixture-two', title: 'Fixture Two', efforts: [] },
    ]);
  });

  it('rejects ambiguous, duplicated and unbounded catalogues', () => {
    for (const value of [
      '',
      'diagnostic message',
      'one  Model\none  Other',
      'one  ' + 'a'.repeat(513),
    ]) {
      expect(() => antigravityModels(value)).toThrow();
    }

    expect(() => antigravityModels('a'.repeat(128 * 1024 + 1))).toThrow();
    expect(() =>
      antigravityModels(Array.from({ length: 101 }, (_, index) => `m${index}  Model`).join('\n')),
    ).toThrow();
  });
});
