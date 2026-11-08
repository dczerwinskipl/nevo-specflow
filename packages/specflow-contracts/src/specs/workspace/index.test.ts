import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import { SpecificationWorkspaceResponseSchema } from './index';

function workspace() {
  return {
    revision: '1',
    specification: {
      id: 'spec-1',
      title: 'Specification',
      summary: '',
      preparationState: 'prepared',
      attention: [],
    },
    sections: {
      tasks: {
        state: 'available',
        data: { groups: [], completed: 0, total: 0, attention: [] },
      },
      documents: { state: 'unavailable', reason: 'not_implemented' },
      sessions: { state: 'available', data: { items: [], attention: [] } },
      activity: { state: 'available', data: { items: [] } },
      repository: { state: 'available', data: { attention: [] } },
      changes: { state: 'unavailable', reason: 'not_implemented' },
    },
    actions: { executeTasks: { available: false }, startSession: { available: false } },
  };
}

describe('Specification Workspace Attention contract', () => {
  it('requires a complete Attention array even when an available source has no items', () => {
    const response = workspace();
    expect(Value.Check(SpecificationWorkspaceResponseSchema, response)).toBe(true);

    for (const feature of ['tasks', 'sessions', 'repository'] as const) {
      const section = response.sections[feature];
      const data: Record<string, unknown> = { ...section.data };
      delete data.attention;
      const invalid = {
        ...response,
        sections: {
          ...response.sections,
          [feature]: { state: 'available', data },
        },
      };
      expect(Value.Check(SpecificationWorkspaceResponseSchema, invalid)).toBe(false);
    }
  });

  it('represents unsupported, temporarily unavailable and forbidden sources explicitly', () => {
    const response = workspace();
    for (const section of [
      { state: 'unavailable', reason: 'source_unavailable' },
      { state: 'unavailable', reason: 'not_implemented' },
      { state: 'forbidden' },
    ]) {
      const projection = {
        ...response,
        sections: { ...response.sections, sessions: section },
      };
      expect(Value.Check(SpecificationWorkspaceResponseSchema, projection)).toBe(true);
    }
  });

  it('requires the provider and update time of a Session row', () => {
    const response = workspace();
    const row = { id: 'session-1', taskIds: [], status: 'quiet', providerId: 'claude' };
    const check = (item: object) =>
      Value.Check(SpecificationWorkspaceResponseSchema, {
        ...response,
        sections: {
          ...response.sections,
          sessions: { state: 'available', data: { items: [item], attention: [] } },
        },
      });
    expect(check({ ...row, updatedAt: '2026-11-08T00:00:00.000Z' })).toBe(true);
    expect(check(row)).toBe(false);
    expect(check({ id: 'session-1', taskIds: [], status: 'quiet', updatedAt: 'x' })).toBe(false);
  });

  it('accepts an untitled Session and a bounded Sessions section with hasMore', () => {
    const response = workspace();
    const sessions = {
      state: 'available',
      data: {
        items: [
          {
            id: 'session-1',
            taskIds: [],
            status: 'quiet',
            providerId: 'claude',
            updatedAt: '2026-11-08T00:00:00.000Z',
          },
          {
            id: 'session-2',
            taskIds: [],
            status: 'authenticationRequired',
            providerId: 'claude',
            providerTitle: 'Claude',
            modelId: 'claude-opus-4-1',
            modelTitle: 'Opus 4.1',
            updatedAt: '2026-11-08T00:00:00.000Z',
          },
        ],
        hasMore: true,
        attention: [],
      },
    };
    expect(
      Value.Check(SpecificationWorkspaceResponseSchema, {
        ...response,
        sections: { ...response.sections, sessions },
      }),
    ).toBe(true);
  });
});
