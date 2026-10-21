import { describe, it, expect, vi } from 'vitest';
import { continueDemoCreation, type CreationProgress } from './creationPipeline';
const location = {
  kind: 'simulated-worktree' as const,
  path: '/demo/sso',
  branch: 'spec/sso',
  simulated: true,
};
const created = {
  specId: 'sso',
  documentIds: ['specification', 'decisions'],
  operationId: '7f3a91c2-4b6e-4d1a-9c0e-2f5a1b8d3e77',
  kind: 'specification-create' as const,
  status: 'completed' as const,
  slug: 'sso',
  workspaceId: '0b8f1c1e-0a11-4c6e-9a01-000000000001',
  relativeManifestPath: 'specs/sso/manifest.json',
};
function operations() {
  return {
    create: vi.fn(() => Promise.resolve(created)),
    allocate: vi.fn(() => Promise.resolve({ sessionId: 'writer', location })),
  };
}
describe('creation stage recovery', () => {
  it('opens the authoritative first document after the atomic create, without a workplace stage', async () => {
    const op = operations();
    const result = await continueDemoCreation({}, { ...op, allocate: undefined });
    expect(result).toEqual({ specId: 'sso', documentId: 'specification' });
    expect(op.allocate).not.toHaveBeenCalled();
  });
  it('retries allocation without repeating creation', async () => {
    const progress: CreationProgress = {};
    const op = operations();
    op.allocate.mockRejectedValueOnce(new Error('provider'));
    await expect(continueDemoCreation(progress, op)).rejects.toThrow('provider');
    expect(progress.created?.specId).toBe('sso');
    expect(await continueDemoCreation(progress, op)).toEqual({
      specId: 'sso',
      documentId: 'specification',
      sessionId: 'writer',
    });
    expect(op.create).toHaveBeenCalledTimes(1);
    expect(op.allocate).toHaveBeenCalledTimes(2);
  });
  it('a failed create keeps nothing, so the same attempt may replay it', async () => {
    const progress: CreationProgress = {};
    const op = operations();
    op.create.mockRejectedValueOnce(new Error('lost ack'));
    await expect(continueDemoCreation(progress, op)).rejects.toThrow('lost ack');
    expect(progress.created).toBeUndefined();
    await continueDemoCreation(progress, op);
    expect(op.create).toHaveBeenCalledTimes(2);
  });
  it('additional sessions reuse the confirmed place', async () => {
    const op = operations();
    await continueDemoCreation({}, { ...op, existingSpecId: 'existing' });
    expect(op.create).not.toHaveBeenCalled();
    expect(op.allocate).toHaveBeenCalledWith('existing');
  });
});
