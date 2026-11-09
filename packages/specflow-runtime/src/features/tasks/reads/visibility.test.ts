import { expect, it } from 'vitest';
import type { RequestAuthorization } from '../../auth';
import { taskVisibility } from './visibility';

const identity = {
  projectId: 'project',
  workspaceId: 'workspace',
  specId: 'spec',
  taskId: 'task',
};
const link = (sessionId: string) => ({
  state: 'available' as const,
  target: { kind: 'session' as const, sessionId },
});

it('rejects the read, not the process, when the Session reference batch fails', async () => {
  const visible = taskVisibility(identity, { can: () => true } as unknown as RequestAuthorization, {
    resolve: () => Promise.resolve(null),
    resolveMany: () => Promise.reject(new Error('store down')),
  });
  // An unobserved per-id promise would surface as an unhandled rejection and fail this test run.
  await expect(visible.prefetch([link('a'), link('b'), link('c')])).rejects.toThrow('store down');
  await expect(visible(link('b'))).rejects.toThrow('store down');
});
