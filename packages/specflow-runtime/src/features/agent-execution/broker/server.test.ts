import { connect } from 'node:net';

import { afterEach, expect, it, vi } from 'vitest';

import type { BrokerDispatcher } from './dispatch';
import { createBrokerServer, type BrokerServer } from './server';

let server: BrokerServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function exchange(path: string, frame: Buffer): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = connect(path);
    const chunks: Buffer[] = [];
    socket.on('data', (chunk: Buffer) => chunks.push(chunk));
    socket.once('error', reject);
    socket.once('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
    socket.write(frame);
  });
}

it('refuses a request frame that is not well-formed UTF-8 without dispatching it', async () => {
  const handle = vi.fn<BrokerDispatcher['handle']>();
  server = createBrokerServer({ dispatcher: { handle } });
  const path = await server.endpoint();

  // 0xC3 0x28: a two-byte lead followed by a byte that is not a continuation byte.
  const frame = Buffer.concat([
    Buffer.from('{"capability":"'),
    Buffer.from([0xc3, 0x28]),
    Buffer.from('"}\n'),
  ]);

  await expect(exchange(path, frame)).resolves.toMatchObject({
    ok: false,
    error: { code: 'AGENT_REQUEST_INVALID', message: 'The request is not valid UTF-8 text.' },
  });
  expect(handle).not.toHaveBeenCalled();
});
