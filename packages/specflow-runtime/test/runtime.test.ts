import { describe, expect, it } from 'vitest';

import { RUNTIME_BOOTSTRAP_MARKER, startRuntime } from '../src/index.js';

describe('startRuntime — bootstrap capability', () => {
  it('returns the deterministic bootstrap marker', () => {
    expect(startRuntime()).toEqual({ kind: 'bootstrap', message: RUNTIME_BOOTSTRAP_MARKER });
  });

  it('is pure — repeated calls give an equal result', () => {
    expect(startRuntime()).toEqual(startRuntime());
  });

  it('uses the canonical Runtime naming', () => {
    expect(RUNTIME_BOOTSTRAP_MARKER).toBe('Nevo SpecFlow runtime bootstrap is available.');
  });
});
