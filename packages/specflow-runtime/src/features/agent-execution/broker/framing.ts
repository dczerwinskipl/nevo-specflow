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
 * Reads one frame: UTF-8 text up to the first `\n`, at most `maxBytes`. Stops reading at the
 * newline; a peer that closes first, or sends more than `maxBytes` without one, is refused.
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
        const text = Buffer.concat(chunks).toString('utf8');
        finish(text.isWellFormed() ? undefined : new FrameError('invalid'), text);
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
