import { describe, expect, it } from 'vitest';
import type {
  SpecificationTaskResponse,
  TaskHistoryPage,
} from '@nevo/specflow-contracts/specs/workspace';
import { createRuntimeApp } from '../../src/server/app';
import { passwordConfig } from '../auth/support/config';

/** A seeded demo Task with a finished implementation and review (two history entries). */
const task = '/api/specs/admission/tasks/admission-contract';

describe('Task snapshot and page HTTP boundary', () => {
  it('serves the demo detail, scopes history pages and rejects stale tokens', async () => {
    const config = passwordConfig();
    const app = await createRuntimeApp(
      { ...config, authentication: { ...config.authentication, mode: 'none' } },
      { dataMode: 'demo' },
    );
    try {
      const response = await app.inject(task);
      expect(response.statusCode).toBe(200);
      const snapshot = response.json<SpecificationTaskResponse>().snapshot!;
      expect(snapshot.specification.id).toBe('admission');
      const history = snapshot.sections.history;
      if (history.state !== 'available') {
        throw new Error('The demo Task history is required.');
      }

      const token = history.data.token;
      const page = await app.inject(`${task}/history?token=${encodeURIComponent(token)}&limit=1`);
      expect(page.statusCode).toBe(200);
      expect(page.headers['cache-control']).toBe('no-store');
      const result = page.json<TaskHistoryPage>();
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).not.toBeNull();
      expect((await app.inject(`${task}/history?token=expired`)).statusCode).toBe(409);
      const wrongScope = await app.inject(
        `/api/specs/admission/tasks/return-context/history?token=${encodeURIComponent(token)}`,
      );
      expect(wrongScope.statusCode).toBe(409);
      const invalidLimit = await app.inject(
        `${task}/history?token=${encodeURIComponent(token)}&limit=51`,
      );
      expect(invalidLimit.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
  it('requires authentication for the history page route', async () => {
    const app = await createRuntimeApp(passwordConfig(), { dataMode: 'demo' });
    try {
      expect((await app.inject(`${task}/history?token=any`)).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
  it('enforces Specification scope before reading detail or pages', async () => {
    const config = passwordConfig();
    const app = await createRuntimeApp(
      {
        ...config,
        authentication: { ...config.authentication, mode: 'none', localUserId: 'demo-user' },
        authorization: {
          assignments: [{ userId: 'demo-user', role: 'viewer', scope: { specId: 'other' } }],
        },
      },
      { dataMode: 'demo' },
    );
    try {
      for (const suffix of ['', '/history?token=any']) {
        expect((await app.inject(`${task}${suffix}`)).statusCode).toBe(403);
      }
    } finally {
      await app.close();
    }
  });
  it('never falls back to demo when the project reader is absent', async () => {
    const config = passwordConfig();
    const app = await createRuntimeApp({
      ...config,
      authentication: { ...config.authentication, mode: 'none' },
    });
    try {
      const page = await app.inject(`${task}/history?token=any`);
      expect(page.statusCode).toBe(503);
      expect(page.json()).toEqual({ error: 'specification_source_unavailable' });
      expect((await app.inject(task)).statusCode).toBe(503);
    } finally {
      await app.close();
    }
  });
});
