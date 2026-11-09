import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach } from 'vitest';

import { createFilesystemWorkflowStore } from './filesystem-store';
import { createMemoryWorkflowStore } from './memory-store.test-support';
import { describeWorkflowStoreContract } from './store-contract.test-support';

let root: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'workflow-store-contract-')));
  await mkdir(join(root, 'state'), { recursive: true });
  await mkdir(join(root, 'checkout', 'specs'), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describeWorkflowStoreContract('memory store', () => createMemoryWorkflowStore());

describeWorkflowStoreContract('filesystem store', () =>
  createFilesystemWorkflowStore({
    stateRoot: join(root, 'state'),
    specificationDirectory: async (specId) => {
      const directory = join(root, 'checkout', 'specs', specId);
      await mkdir(directory, { recursive: true });

      return directory;
    },
  }),
);
