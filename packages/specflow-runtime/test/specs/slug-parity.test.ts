import { randomUUID } from 'node:crypto';

import { deriveSpecSlug, isValidBranchName } from '@nevo/specflow-contracts/specs';
import {
  createSpecificationScaffold,
  normalizeCreateClientIntent,
  seedCatalogueForTesting,
} from '@nevo/specflow-engine/testing';
import { describe, expect, it } from 'vitest';

const catalogue = await seedCatalogueForTesting();

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
      catalogue,
      archetypeId: 'minimal',
      specId: randomUUID(),
      title,
      created: '2026-10-14',
    }).slug;
    expect(deriveSpecSlug(title)).toBe(engine);
  });
});

describe('branch override: UI rule equals the Engine rule', () => {
  it.each([
    'feature/ok',
    'a',
    'release-1.2/rc.1',
    '_x',
    'zażółć',
    'a#b',
    'a@b',
    '-x',
    'a..b',
    'a//b',
    'a/',
    'a.',
    'x.lock',
    'a/.hidden',
    'a b',
    'x'.repeat(240),
    'x'.repeat(241),
    '',
  ])('%j', (branch) => {
    let engineAccepts = true;
    try {
      normalizeCreateClientIntent({
        archetype: { id: 'minimal', version: 1 },
        title: 'T',
        target: { kind: 'new-worktree', branch },
      });
    } catch {
      engineAccepts = false;
    }

    expect(isValidBranchName(branch)).toBe(engineAccepts);
  });
});
