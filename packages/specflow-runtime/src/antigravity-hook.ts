import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { runAntigravityHook } from './features/sessions';

// Import-safe package entry: build surface validation imports every export.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const hook = process.argv[2];
  let decision: 'allow' | 'auto_approve' | 'deny' | 'stop';
  try {
    if (hook !== 'pre-tool-use' && hook !== 'stop') {
      throw new Error('Invalid hook role.');
    }

    const chunks: Buffer[] = [];
    let bytes = 0;
    const signal = AbortSignal.timeout(1810000);
    signal.addEventListener('abort', () => process.stdin.destroy(), { once: true });
    const inputDeadline = setTimeout(() => process.stdin.destroy(), 5000);
    inputDeadline.unref();
    try {
      for await (const chunk of process.stdin) {
        if (!Buffer.isBuffer(chunk) || (bytes += chunk.length) > 65536) {
          throw new Error('Hook input exceeds bounds.');
        }

        chunks.push(chunk);
      }
    } finally {
      clearTimeout(inputDeadline);
    }

    decision = (
      await runAntigravityHook({
        hook,
        configurationPath: process.env.NEVO_ANTIGRAVITY_HOOK_CONFIG ?? '',
        input: Buffer.concat(chunks),
        signal,
      })
    ).decision;
  } catch {
    decision = 'deny';
  }

  process.stdout.write(JSON.stringify({ decision }) + '\n');
}

export {};
