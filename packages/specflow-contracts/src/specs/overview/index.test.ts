import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';

import { SpecsOverviewSchema } from './index';

const baseItem = {
  id: 'spec',
  title: 'Specification',
  updatedAt: '2026-10-01T12:00:00Z',
  progress: { completed: 2, total: 3 },
};

describe('Specs Overview contracts', () => {
  it('keeps Archive free from Current-only section and steering fields', () => {
    const archive = {
      collection: 'archive',
      revision: '1',
      items: [{ ...baseItem, completedAt: '2026-09-01T12:00:00Z' }],
    };

    expect(Value.Check(SpecsOverviewSchema, archive)).toBe(true);
    expect(Value.Check(SpecsOverviewSchema, { ...archive, sections: [] })).toBe(false);
    expect(
      Value.Check(SpecsOverviewSchema, {
        ...archive,
        items: [{ ...baseItem, classification: { section: 'not-started' } }],
      }),
    ).toBe(false);
  });

  it('requires an explicit Current classification and ordered section list', () => {
    expect(
      Value.Check(SpecsOverviewSchema, {
        collection: 'current',
        revision: '1',
        sections: ['requires-attention', 'in-progress', 'not-started', 'ended'],
        items: [
          {
            ...baseItem,
            workflow: { kind: 'not-started' },
            classification: { section: 'not-started' },
            signals: [],
            currentExecutions: [],
          },
        ],
      }),
    ).toBe(true);
  });

  it('carries where the workflow run stands, with the Task counts of a wait step', () => {
    const current = (workflow: unknown) => ({
      collection: 'current',
      revision: '1',
      sections: ['in-progress'],
      items: [
        {
          ...baseItem,
          workflow,
          classification: { section: 'in-progress' },
          signals: [],
          currentExecutions: [],
        },
      ],
    });

    expect(
      Value.Check(
        SpecsOverviewSchema,
        current({
          kind: 'step',
          state: 'waiting',
          step: { title: 'Waiting for Tasks', position: 6, count: 7 },
          tasks: { open: 12, total: 12, inProgress: 0, readyToStart: 5 },
        }),
      ),
    ).toBe(true);
    expect(Value.Check(SpecsOverviewSchema, current({ kind: 'ended', outcome: 'completed' }))).toBe(
      true,
    );
    // The manifest's free status is no Current field any more.
    expect(
      Value.Check(SpecsOverviewSchema, {
        ...current({ kind: 'not-started' }),
        items: [{ ...current({ kind: 'not-started' }).items[0], status: 'draft' }],
      }),
    ).toBe(false);
  });

  it('accepts explicitly unknown progress, signals and session evidence', () => {
    expect(
      Value.Check(SpecsOverviewSchema, {
        collection: 'current',
        revision: 'unknown',
        sections: ['unknown'],
        items: [
          {
            ...baseItem,
            progress: null,
            workflow: null,
            classification: { section: 'unknown' },
            signals: null,
            currentExecutions: null,
          },
        ],
      }),
    ).toBe(true);
  });

  it('allows Requires attention before a semantic attention reason is classified', () => {
    expect(
      Value.Check(SpecsOverviewSchema, {
        collection: 'current',
        revision: '1',
        sections: ['requires-attention'],
        items: [
          {
            ...baseItem,
            workflow: { kind: 'step', state: 'ready' },
            classification: { section: 'requires-attention' },
            signals: [
              {
                id: 'attention',
                kind: 'attention',
                label: 'Human attention required',
                priority: 1,
                target: { kind: 'specification', specId: 'spec' },
              },
            ],
            currentExecutions: [],
          },
        ],
      }),
    ).toBe(true);
  });
});
