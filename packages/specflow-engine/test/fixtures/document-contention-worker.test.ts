import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { it } from 'vitest';

import { sha256Hex } from '../../src/hash';
import { openSpecFlowEngine } from '../../src/testing';
import { applyDocumentChange } from '../../src/specs/documents/api';
import { SettleLedger } from '../../src/specs/documents/queue/settle-ledger';
import { runQueueOnce } from '../../src/specs/documents/queue/worker';

const enabled = process.env.NEVO_DOC_CONTENTION === '1';

interface Outcome {
  readonly acknowledged: { id: string; path: string; content: string }[];
  readonly attempted: { path: string; content: string }[];
  readonly refused: string[];
  readonly unexpected: string[];
  readonly queue: string[];
}

/**
 * One of several independent processes that save the documents of one Specification and drive the
 * queue, round after round, against the same checkout. It records what it was acknowledged.
 */
it.skipIf(!enabled)(
  'saves and commits against other processes and reports what it was acknowledged',
  async () => {
    const root = process.env.NEVO_DOC_CONTENTION_HOME!;
    const dir = process.env.NEVO_DOC_CONTENTION_DIR!;
    const specId = process.env.NEVO_DOC_CONTENTION_SPEC!;
    const result = process.env.NEVO_DOC_CONTENTION_RESULT!;
    const worker = Number(process.env.NEVO_DOC_CONTENTION_WORKER);
    const rounds = Number(process.env.NEVO_DOC_CONTENTION_ROUNDS);
    const documents = Number(process.env.NEVO_DOC_CONTENTION_DOCUMENTS);
    const engine = await openSpecFlowEngine({ cwd: root });
    const ledger = new SettleLedger();
    const outcome: Outcome = {
      acknowledged: [],
      attempted: [],
      refused: [],
      unexpected: [],
      queue: [],
    };
    for (let round = 0; round < rounds; round += 1) {
      // Workers share documents (index modulo the count), so some saves really contend.
      const index = ((worker + round) % documents) + 1;
      const path = `notes-${index}.md`;
      const content = `worker ${worker} round ${round}\n`;
      const id = randomUUID();
      const current = await readFile(join(dir, path), 'utf8');
      outcome.attempted.push({ path, content });
      try {
        await applyDocumentChange(engine, specId, id, {
          action: 'save',
          documentId: `notes-${index}`,
          content,
          expectedRevision: sha256Hex(current),
        });
        outcome.acknowledged.push({ id, path, content });
      } catch (error) {
        const code = (error as { code?: unknown }).code;
        // A coded refusal is the contract (the test knows which ones are allowed); a raw error is a defect.
        if (typeof code === 'string') outcome.refused.push(code);
        else outcome.unexpected.push(String((error as Error).stack ?? error));
      }
      try {
        const run = await runQueueOnce(engine, { ledger }, undefined, { flush: true });
        outcome.queue.push(run.status);
      } catch (error) {
        outcome.unexpected.push(String((error as Error).stack ?? error));
      }
    }
    await writeFile(result, JSON.stringify(outcome));
  },
  240000,
);
