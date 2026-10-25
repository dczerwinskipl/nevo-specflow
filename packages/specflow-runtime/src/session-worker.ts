import { isMainThread, workerData } from 'node:worker_threads';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';

// Raw-source tests use Node's native type stripping. Resolution is local to this Worker;
// installed builds bundle the module and never install this hook.
if (!isMainThread && (workerData as { kind?: string })?.kind === 'session-store') {
  const hooks = import.meta.url.endsWith('.ts')
    ? registerHooks({
        resolve(specifier, context, nextResolve) {
          return nextResolve(
            specifier.startsWith('.') && !extname(specifier) ? specifier + '.ts' : specifier,
            context,
          );
        },
      })
    : undefined;
  try {
    await import('./features/sessions/persistence/worker');
  } finally {
    hooks?.deregister();
  }
}
export {};
