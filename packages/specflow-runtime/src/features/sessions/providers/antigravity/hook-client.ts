import { lstat, readFile } from 'node:fs/promises';
import { McpQuestionTransportLimits } from '../../interactions/mcp/limits';

/** Fixed helper transport only. No arguments from tool input enter a shell command. */
export async function runAntigravityHook(options: {
  hook: 'pre-tool-use' | 'stop';
  configurationPath: string;
  input: Uint8Array;
  signal: AbortSignal;
}): Promise<{ decision: 'allow' | 'deny' | 'stop' }> {
  try {
    options.signal.throwIfAborted();
    if (
      !['pre-tool-use', 'stop'].includes(options.hook) ||
      options.input.byteLength > McpQuestionTransportLimits.requestBytes
    ) {
      throw new Error('Invalid hook request.');
    }

    const stat = await lstat(options.configurationPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) {
      throw new Error('Private hook configuration unavailable.');
    }

    const bytes = await readFile(options.configurationPath);
    if (bytes.byteLength > 4096) {
      throw new Error('Private hook configuration exceeds bounds.');
    }

    const configuration: unknown = JSON.parse(bytes.toString('utf8'));
    if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) {
      throw new Error('Invalid hook configuration.');
    }

    const config = configuration as Record<string, unknown>;
    if (
      Object.keys(config).sort().join(',') !== 'baseUrl,token' ||
      typeof config.baseUrl !== 'string' ||
      typeof config.token !== 'string' ||
      !/^Bearer [A-Za-z0-9_-]{43}$/.test(config.token)
    ) {
      throw new Error('Invalid hook configuration.');
    }

    const url = new URL(config.baseUrl);
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      !url.port ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new Error('Invalid hook listener.');
    }

    const response = await fetch(new URL('/hooks/' + options.hook, url), {
      method: 'POST',
      redirect: 'error',
      headers: { authorization: config.token, 'content-type': 'application/json' },
      body: Buffer.from(options.input),
      signal: AbortSignal.any([
        options.signal,
        AbortSignal.timeout(
          McpQuestionTransportLimits.humanResponseMs + McpQuestionTransportLimits.deliveryMs,
        ),
      ]),
    });
    if (!response.ok || !response.body) {
      throw new Error('Hook response unavailable.');
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }

        const bytes: unknown = chunk.value;
        if (!(bytes instanceof Uint8Array)) {
          throw new Error('Invalid hook response bytes.');
        }

        size += bytes.byteLength;
        if (size > 1024) {
          throw new Error('Hook response exceeds bounds.');
        }

        chunks.push(bytes);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }

    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Invalid hook response.');
    }

    const output = value as Record<string, unknown>;
    if (
      Object.keys(output).join(',') !== 'decision' ||
      !(options.hook === 'stop' ? ['stop', 'deny'] : ['allow', 'deny']).includes(
        String(output.decision),
      )
    ) {
      throw new Error('Invalid hook decision.');
    }

    return { decision: output.decision as 'allow' | 'deny' | 'stop' };
  } catch {
    return { decision: 'deny' };
  }
}
