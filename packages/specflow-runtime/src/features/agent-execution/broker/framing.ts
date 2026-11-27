import type { Socket } from 'node:net';

export class FrameError extends Error {
  readonly reason: 'too-large' | 'closed' | 'invalid';

  constructor(reason: FrameError['reason']) {
    super(`Agent broker frame ${reason}.`);
    this.name = 'FrameError';
    this.reason = reason;
  }
}

/**
 * Strict decoder: `Buffer.toString('utf8')` replaces invalid bytes with U+FFFD and would accept
 * the frame, so an ill-formed byte sequence is refused here instead.
 */
const utf8 = new TextDecoder('utf-8', { fatal: true });

/**
 * Reads one frame: UTF-8 text up to the first `\n`, at most `maxBytes`. Stops reading at the
 * newline; a peer that closes first, sends more than `maxBytes` without one, or sends bytes that
 * are not well-formed UTF-8, is refused.
 */
export function readFrame(socket: Socket, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const finish = (error?: FrameError, frame?: string) => {
      socket.off('data', onData);
      socket.off('end', onEnd);
      socket.off('error', onError);
      socket.off('close', onEnd);
      if (error) {
        reject(error);
      } else {
        resolve(frame!);
      }
    };

    const onData = (chunk: Buffer) => {
      const newline = chunk.indexOf(0x0a);
      const part = newline === -1 ? chunk : chunk.subarray(0, newline);
      size += part.length;
      if (size > maxBytes) {
        finish(new FrameError('too-large'));

        return;
      }

      chunks.push(part);
      if (newline !== -1) {
        socket.pause();
        let text: string;
        try {
          text = utf8.decode(Buffer.concat(chunks));
        } catch {
          finish(new FrameError('invalid'));

          return;
        }

        finish(undefined, text);
      }
    };

    const onEnd = () => finish(new FrameError('closed'));
    const onError = () => finish(new FrameError('closed'));
    socket.on('data', onData);
    socket.once('end', onEnd);
    socket.once('close', onEnd);
    socket.once('error', onError);
  });
}
