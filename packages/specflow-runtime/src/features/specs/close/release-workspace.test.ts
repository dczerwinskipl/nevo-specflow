import { describe, expect, it, vi } from 'vitest';

import { createWorkspaceOccupancy } from '../../workspaces';
import {
  assertNoRunningTurns,
  releaseAfterQuiescence,
  specificationOccupancy,
  whileReleased,
  WorkspaceBusyError,
} from './release-workspace';

describe('releasing a workspace around Close', () => {
  it('releases only a linked plan source, and ends the hold when Close fails', async () => {
    const end = vi.fn();
    const release = vi.fn(() => Promise.resolve({ end }));

    // A retry after the binding moved to the primary still carries the plan's linked source.
    const linked = { workspaceId: 'linked-1', kind: 'linked' } as const;
    await expect(whileReleased(release, linked, () => Promise.resolve('done'))).resolves.toBe(
      'done',
    );
    expect(release).toHaveBeenCalledWith('linked-1');
    expect(end).toHaveBeenCalledOnce();

    await expect(
      whileReleased(release, linked, () => Promise.reject(new Error('close failed'))),
    ).rejects.toThrow('close failed');
    expect(end).toHaveBeenCalledTimes(2);

    await whileReleased(release, { workspaceId: 'primary', kind: 'primary' }, () =>
      Promise.resolve(),
    );
    expect(release).toHaveBeenCalledTimes(2);
  });

  it('refuses a Close of a checkout an agent Turn works in, and holds it against new Turns', async () => {
    const occupancy = createWorkspaceOccupancy();
    const docsEnd = vi.fn();
    const release = releaseAfterQuiescence(occupancy, () => Promise.resolve({ end: docsEnd }));
    const linked = { workspaceId: 'linked-1', kind: 'linked' } as const;
    const turn = occupancy.beginTurn('linked-1', 'session-1')!;

    // The preview refuses the same way, without holding anything.
    expect(() => assertNoRunningTurns((id) => occupancy.runningSessions(id), linked)).toThrow(
      WorkspaceBusyError,
    );
    await expect(whileReleased(release, linked, () => Promise.resolve())).rejects.toMatchObject({
      sessionIds: ['session-1'],
    });
    expect(docsEnd).not.toHaveBeenCalled();

    turn.end();
    let duringClose: unknown;
    await whileReleased(release, linked, () => {
      duringClose = occupancy.beginTurn('linked-1', 'session-2');

      return Promise.resolve();
    });
    expect(duringClose).toBeUndefined();
    expect(docsEnd).toHaveBeenCalledOnce();
    expect(occupancy.beginTurn('linked-1', 'session-2')).toBeDefined();
  });

  it('reads the running Turns of a Specification checkout from its binding, never of the primary', () => {
    const registry = {
      primaryWorkspaceId: 'primary',
      specBindings: [
        { specId: 'spec-linked', workspaceId: 'linked-1' },
        { specId: 'spec-primary', workspaceId: 'primary' },
      ],
    };
    const running = vi.fn((workspaceId: string) =>
      workspaceId === 'linked-1' || workspaceId === 'primary' ? ['session-1'] : [],
    );

    expect(specificationOccupancy(registry, 'spec-linked', running)).toEqual([
      expect.objectContaining({ kind: 'session-turn-running', subjectIds: ['session-1'] }),
    ]);
    expect(specificationOccupancy(registry, 'spec-primary', running)).toEqual([]);
    expect(specificationOccupancy(registry, 'spec-unbound', running)).toEqual([]);
    expect(running).toHaveBeenCalledOnce();
    expect(specificationOccupancy(registry, 'spec-linked', undefined)).toEqual([]);
  });
});
