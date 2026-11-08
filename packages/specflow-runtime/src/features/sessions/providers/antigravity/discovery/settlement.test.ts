import { expect, it, vi } from 'vitest';
import { launchOwnedProcess, ProviderProcessError } from '../../process';
import { discoveryFixture as fixture } from './transport.fixture';

it('keeps unverified process/startup resources in the shared capacity budget and expires their invocation', async () => {
  for (const kind of ['receipt', 'startup']) {
    const launch: typeof launchOwnedProcess = async (options) => {
      if (kind === 'startup') {
        await options.scope.close();

        throw new ProviderProcessError('START_FAILED', 'Controlled partial startup failure', [
          { resource: 'temporary-files', code: 'PROCESS_NOT_STOPPED' },
        ]);
      }

      const owner = await launchOwnedProcess(options);

      return {
        ...owner,
        async dispose() {
          const receipt = await owner.dispose();

          return {
            ...receipt,
            process: { state: 'unknown' as const, reason: 'unverified-tree' as const },
          };
        },
      };
    };

    const f = await fixture(undefined, false, launch);
    f.bridge.activate();
    await expect(f.call('find_files', { pattern: '*.ts' })).rejects.toThrow();
    await expect(f.call('find_files', { pattern: '*.ts' })).rejects.toThrow();
    await expect(f.bridge.close()).rejects.toThrow('settlement is unverified');
    expect(f.bridge.processSettlementVerified()).toBe(false);
    // Only the receipt is fault-injected: real fixture processes were disposed.
    // Avoid repeating the expected failed close during fixture cleanup.
    vi.spyOn(f.bridge, 'close').mockResolvedValue();
  }

  const next = await fixture();
  next.bridge.activate();
  expect(await next.call('find_files', { pattern: '*.ts' })).toMatchObject({
    error: true,
    data: { status: 'failed', reasons: ['runtime-discovery-busy'] },
  });
});
