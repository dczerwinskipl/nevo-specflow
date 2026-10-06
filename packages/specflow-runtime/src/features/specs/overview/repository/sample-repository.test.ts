import { describe, expect, it } from 'vitest';

import { classifyCurrentSpec } from '../current/classify-spec';
import { createSampleSpecsOverviewRepository } from './sample-repository';

describe('sample Specs Overview repository', () => {
  it('returns repository records without transport classifications', async () => {
    const repository = createSampleSpecsOverviewRepository();
    const snapshot = await repository.readCurrent();

    expect(snapshot.items).toHaveLength(6);
    expect(snapshot.items.every((item) => !('classification' in item))).toBe(true);
    expect(new Set(snapshot.items.map((item) => item.id)).size).toBe(snapshot.items.length);
  });

  it('provides evidence from which Current classification is deterministic', async () => {
    const repository = createSampleSpecsOverviewRepository();
    const snapshot = await repository.readCurrent();

    expect(
      snapshot.items
        .filter((item) => classifyCurrentSpec(item).section === 'requires-attention')
        .map((item) => item.id),
    ).toEqual(['admission', 'security', 'review']);
    expect(classifyCurrentSpec(snapshot.items.find((item) => item.id === 'providers')!)).toEqual({
      section: 'active',
    });
    expect(classifyCurrentSpec(snapshot.items.find((item) => item.id === 'packaging')!)).toEqual({
      section: 'ready',
    });
    expect(classifyCurrentSpec(snapshot.items.find((item) => item.id === 'localization')!)).toEqual(
      {
        section: 'draft',
      },
    );
  });

  it('returns Archive records without Current-only evidence', async () => {
    const repository = createSampleSpecsOverviewRepository();
    const snapshot = await repository.readArchive();

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]).not.toHaveProperty('readyForWork');
    expect(snapshot.items[0]).not.toHaveProperty('signals');
    expect(snapshot.items[0]).not.toHaveProperty('currentExecutions');
  });
});
