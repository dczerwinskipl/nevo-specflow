import { createServer, type Server, type Socket } from 'node:net';

import { AGENT_BROKER_LIMITS, type AgentBrokerResponse } from '@nevo/specflow-contracts/runtime';

import type { BrokerDispatcher } from './dispatch';
import { openBrokerEndpoint, type BrokerEndpoint } from './endpoint';
import { FrameError, readFrame } from './framing';

/** Connections served at once; more wait in the listen backlog. */
const MAX_CONNECTIONS = 16;
/** A connection that sends no complete request in this time is closed (a stuck client). */
const IDLE_MS = 30_000;

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
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    socket.setTimeout(IDLE_MS, () => socket.destroy());
    void (async () => {
      let frame: string;
      try {
        frame = await readFrame(socket, AGENT_BROKER_LIMITS.requestBytes);
      } catch (error) {
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

      const response = await options.dispatcher.handle(frame);
      if (!socket.destroyed) {
        write(socket, response);
      }
    })();
  }

  async function listen() {
    const endpoint = await (options.openEndpoint ?? openBrokerEndpoint)();
    const server = createServer({ allowHalfOpen: false, pauseOnConnect: false }, serve);
    server.maxConnections = MAX_CONNECTIONS;
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
