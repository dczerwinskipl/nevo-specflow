import { createServer, type Server, type Socket } from 'node:net';

import { AGENT_BROKER_LIMITS, type AgentBrokerResponse } from '@nevo/specflow-contracts/runtime';

import type { BrokerDispatcher } from './dispatch';
import { openBrokerEndpoint, type BrokerEndpoint } from './endpoint';
import { FrameError, readFrame } from './framing';

/** Connections served at once; one more is answered with a refusal line and closed. */
const MAX_CONNECTIONS = 16;
/**
 * Absolute deadline for the request frame, counted from the connection (not an idle timer, so a
 * client trickling bytes cannot hold a slot). Cleared once the frame is read: a long Engine call
 * keeps its connection until it answers.
 */
const FRAME_DEADLINE_MS = 5_000;

function write(socket: Socket, response: AgentBrokerResponse) {
  socket.end(JSON.stringify(response) + '\n');
}

/**
 * The broker's listener: one request frame and one response frame per connection. It logs
 * nothing of a request (a frame carries the capability). Listens on first use and closes with the
 * Runtime.
 */
export function createBrokerServer(options: {
  dispatcher: BrokerDispatcher;
  openEndpoint?: () => Promise<BrokerEndpoint>;
}) {
  let listening: Promise<{ server: Server; endpoint: BrokerEndpoint }> | undefined;
  const sockets = new Set<Socket>();
  let closed = false;

  function serve(socket: Socket) {
    socket.on('error', () => socket.destroy());
    if (sockets.size >= MAX_CONNECTIONS) {
      write(socket, {
        ok: false,
        error: {
          code: 'AGENT_BROKER_UNAVAILABLE',
          message: 'The broker is serving too many requests at once; retry shortly.',
          details: { reason: 'busy' },
        },
      });

      return;
    }

    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    const deadline = setTimeout(() => socket.destroy(), FRAME_DEADLINE_MS);
    deadline.unref();
    void (async () => {
      let frame: string;
      try {
        frame = await readFrame(socket, AGENT_BROKER_LIMITS.requestBytes);
      } catch (error) {
        clearTimeout(deadline);
        if (error instanceof FrameError && error.reason !== 'closed') {
          write(socket, {
            ok: false,
            error: {
              code: 'AGENT_REQUEST_INVALID',
              message:
                error.reason === 'too-large'
                  ? 'The request is larger than the broker accepts.'
                  : 'The request is not valid UTF-8 text.',
            },
          });
        } else {
          socket.destroy();
        }

        return;
      }

      clearTimeout(deadline);
      const response = await options.dispatcher.handle(frame);
      if (!socket.destroyed) {
        write(socket, response);
      }
    })();
  }

  async function listen() {
    const endpoint = await (options.openEndpoint ?? openBrokerEndpoint)();
    const server = createServer({ allowHalfOpen: false, pauseOnConnect: false }, serve);
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen({ path: endpoint.path, exclusive: true }, () => {
          server.off('error', reject);
          resolve();
        });
      });
    } catch (error) {
      await endpoint.dispose();

      throw error;
    }

    return { server, endpoint };
  }

  return {
    /** The endpoint path, listening. */
    async endpoint(): Promise<string> {
      if (closed) {
        throw new Error('The agent broker is closed.');
      }

      listening ??= listen().catch((error: unknown) => {
        listening = undefined;

        throw error;
      });

      return (await listening).endpoint.path;
    },

    async close() {
      closed = true;
      const current = await listening?.catch(() => undefined);
      if (!current) {
        return;
      }

      for (const socket of sockets) {
        socket.destroy();
      }

      await new Promise<void>((resolve) => current.server.close(() => resolve()));
      await current.endpoint.dispose();
    },
  };
}

export type BrokerServer = ReturnType<typeof createBrokerServer>;
