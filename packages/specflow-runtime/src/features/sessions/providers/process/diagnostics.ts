import { stripVTControlCharacters } from 'node:util';

function plain(text: string) {
  return stripVTControlCharacters(text.toWellFormed()).replace(
    // eslint-disable-next-line no-control-regex -- Strip terminal control bytes before matching secrets.
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,
    '',
  );
}
export function sanitizeDiagnostic(text: string, secrets: readonly string[] = []): string {
  text = plain(text);
  const variants = new Set<string>();
  for (const secret of secrets) {
    for (const value of [secret, plain(secret), ...plain(secret).split(/\r?\n/)]) {
      if (!value) continue;
      variants.add(value);
      variants.add(JSON.stringify(value).slice(1, -1));
      variants.add(encodeURIComponent(value.toWellFormed()));
      try {
        const url = new URL(value);
        if (url.password) {
          variants.add(url.password);
          variants.add(decodeURIComponent(url.password));
        }
      } catch {
        /* Not a URL. */
      }
    }
  }
  for (const value of [...variants].sort((a, b) => b.length - a.length))
    text = text.split(value).join('[redacted]');
  text = text
    .replace(/\b(Bearer\s+)\S+/gi, '$1[redacted]')
    .replace(
      /((?:--)?(?:api[-_]?key|access[-_]?token|refresh[-_]?token|token|password|secret|cookie|credential|connection[-_]?string)\s*[=:]\s*)(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[^\s"']+)/gi,
      '$1[redacted]',
    )
    .replace(
      /(--(?:api[-_]?key|token|password|secret)\s+)(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|\S+)/gi,
      '$1[redacted]',
    )
    .replace(
      /("(?:api[-_]?key|access[-_]?token|refresh[-_]?token|token|password|secret|authorization|cookie|credential|connection[-_]?string)"\s*:\s*")(?:\\.|[^"\\\r\n])*(")/gi,
      '$1[redacted]$2',
    )
    .replace(
      /(\\"(?:api[-_]?key|access[-_]?token|refresh[-_]?token|token|password|secret|authorization|cookie|credential|connection[-_]?string)\\"\s*:\s*\\").*/gi,
      '$1[redacted]',
    )
    .replace(/(https?:\/\/[^\s/:@]+:)[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[redacted]');

  return text;
}

interface Capture {
  frames: (Buffer | undefined)[];
  head: number;
  bytes: number;
  truncated: boolean;
  settledAt?: number;
}
const emptyFrame = Buffer.alloc(0),
  emptyLine = Buffer.from('\n');
/** Private, sanitized, disposable evidence. Raw protocol recording remains disabled. */
export function createDiagnosticStore(
  options: {
    enabled?: boolean;
    maxInvocationBytes?: number;
    maxTotalBytes?: number;
    maxAgeMs?: number;
    now?: () => number;
  } = {},
) {
  const per = options.maxInvocationBytes ?? 1024 * 1024,
    total = options.maxTotalBytes ?? 100 * 1024 * 1024,
    age = options.maxAgeMs ?? 7 * 86400000;
  for (const [value, max] of [
    [per, 1024 * 1024],
    [total, 100 * 1024 * 1024],
    [age, 7 * 86400000],
  ] as const)
    if (!Number.isSafeInteger(value) || value < 1 || value > max)
      throw new Error('Invalid diagnostic retention budget.');
  const captures = new Map<string, Capture>();
  const now = options.now ?? Date.now;
  let bytes = 0;
  function remove(id: string) {
    const item = captures.get(id);
    if (item) {
      bytes -= item.bytes;
      item.frames = [];
      item.head = 0;
      item.bytes = 0;
    }
    captures.delete(id);
  }
  function prune() {
    for (const [id, item] of captures)
      if (item.settledAt !== undefined && now() - item.settledAt >= age) remove(id);
  }
  return {
    open(id: string, secrets: readonly string[] = []) {
      prune();
      if (captures.has(id)) throw new Error('Diagnostic invocation is already owned.');
      const capture: Capture = { frames: [], head: 0, bytes: 0, truncated: false };
      if (options.enabled) {
        for (const [other, item] of captures) {
          if (captures.size < 1024) break;
          if (item.settledAt !== undefined) remove(other);
        }
        if (captures.size >= 1024) throw new Error('Diagnostic capture capacity reached.');
        captures.set(id, capture);
      }
      let finished = false;
      const pending = new Map<string, { pieces: Buffer[]; bytes: number; dropping: boolean }>();
      function frame(raw: Buffer) {
        if (!options.enabled || captures.get(id) !== capture) return;
        let text: string;
        try {
          text = new TextDecoder('utf8', { fatal: true }).decode(raw);
        } catch {
          text = '[invalid diagnostic encoding]';
          capture.truncated = true;
        }
        let value = raw.length ? Buffer.from(sanitizeDiagnostic(text, secrets) + '\n') : emptyLine;
        if (value.length > per) {
          value = Buffer.from('[diagnostic frame exceeds retention budget]\n');
          capture.truncated = true;
        }
        if (value.length > per) {
          capture.truncated = true;
          return;
        }
        while (
          (capture.bytes + value.length > per || capture.frames.length - capture.head >= 1024) &&
          capture.frames.length > capture.head
        ) {
          const old = capture.frames[capture.head]!;
          capture.frames[capture.head++] = undefined;
          capture.bytes -= old.length;
          bytes -= old.length;
          capture.truncated = true;
        }
        // Amortized constant-time head eviction; retired buffers are released immediately.
        if (capture.head >= 512) {
          capture.frames = capture.frames.slice(capture.head);
          capture.head = 0;
        }
        for (const [other, item] of captures) {
          if (bytes + value.length <= total) break;
          if (other !== id && item.settledAt !== undefined) remove(other);
        }
        if (bytes + value.length > total) {
          capture.truncated = true;
          return;
        }
        capture.frames.push(value);
        capture.bytes += value.length;
        bytes += value.length;
      }
      return {
        write(stream: 'stdout' | 'stderr', chunk: Uint8Array) {
          if (finished || !options.enabled) return;
          prune();
          const state = pending.get(stream) ?? { pieces: [], bytes: 0, dropping: false };
          pending.set(stream, state);
          const data = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
          let start = 0;
          for (;;) {
            const newline = data.indexOf(10, start),
              end = newline === -1 ? data.length : newline;
            const part = data.subarray(start, end);
            if (!state.dropping) {
              if (state.bytes + part.length > 65536) {
                state.pieces = [];
                state.bytes = 0;
                state.dropping = true;
                capture.truncated = true;
              } else {
                if (part.length) state.pieces.push(Buffer.from(part));
                state.bytes += part.length;
                if (state.pieces.length >= 1024) state.pieces = [Buffer.concat(state.pieces)];
              }
            }
            if (newline === -1) break;
            if (!state.dropping)
              frame(state.bytes ? Buffer.concat(state.pieces, state.bytes) : emptyFrame);
            state.pieces = [];
            state.bytes = 0;
            state.dropping = false;
            start = newline + 1;
          }
        },
        finish() {
          if (finished) return;
          finished = true;
          for (const state of pending.values())
            if (!state.dropping && state.bytes) frame(Buffer.concat(state.pieces, state.bytes));
          pending.clear();
          capture.settledAt = now();
          prune();
        },
        release() {
          finished = true;
          pending.clear();
          if (captures.get(id) === capture) remove(id);
        },
      };
    },
    read(id: string) {
      prune();
      const item = captures.get(id);
      return item
        ? {
            text: Buffer.concat(
              item.frames.slice(item.head).map((frame) => frame!),
              item.bytes,
            ).toString('utf8'),
            truncated: item.truncated,
          }
        : undefined;
    },
    statistics() {
      prune();
      return { captures: captures.size, bytes };
    },
  };
}
export type DiagnosticStore = ReturnType<typeof createDiagnosticStore>;
