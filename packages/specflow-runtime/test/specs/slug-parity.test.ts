import { randomUUID } from 'node:crypto';

import { deriveSpecSlug } from '@nevo/specflow-contracts/specs';
import { createSpecificationScaffold } from '@nevo/specflow-engine/testing';
import { describe, expect, it } from 'vitest';

describe('title-derived slug: UI preview rule equals the Engine rule', () => {
  it.each([
    'Nowa obsługa płatności!',
    '  Żółty   Projekt  ',
    'Login -- SSO / OIDC',
    'x'.repeat(120),
    'a'.repeat(79) + ' tail',
    'Ünïcödé Café',
  ])('%j', (title) => {
    const engine = createSpecificationScaffold({
      specId: randomUUID(),
      title,
      created: '2026-10-14',
    }).slug;
    expect(deriveSpecSlug(title)).toBe(engine);
  });
});
