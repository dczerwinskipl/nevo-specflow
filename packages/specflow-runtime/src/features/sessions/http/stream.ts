import type { FastifyInstance, FastifyRequest, FastifyReply, RawServerBase } from 'fastify';
import { once } from 'node:events';
import { SessionLimits } from '@nevo/specflow-contracts/sessions';
import type { SessionCoordinator } from '../lifecycle/coordinator';
import type { EventBatch } from '../persistence/protocol';
import { SessionError } from '../errors';
import { createStreamWakeup } from './wakeup';
import { authorizeSession } from './authorization';
import { effectiveEvent } from './projection';

export function createSessionStreams<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
) {
  const streams = new Set<AbortController>();
  const perActor = new Map<string, number>();
  app.addHook('preClose', (done) => {
    for (const controller of streams) controller.abort();
    done();
  });
  return {
    async open(
      request: FastifyRequest,
      reply: FastifyReply,
      coordinator: SessionCoordinator,
      sid: string,
      principal: string,
      suppliedAfter?: string,
    ) {
      const header = request.headers['last-event-id'];
      if (
        Array.isArray(header) ||
        (suppliedAfter !== undefined && header !== undefined && suppliedAfter !== header)
      )
        throw new SessionError('SESSION_CURSOR_INVALID', 'Conflicting replay cursors.');
      const supplied = suppliedAfter ?? header;
      const initial = await coordinator.store.call<EventBatch>({
        op: 'events',
        sessionId: sid,
        after: 0,
      });
      let after = supplied === undefined ? initial.latest : Number(supplied);
      if (!Number.isSafeInteger(after) || after < 0 || after > initial.latest)
        throw new SessionError('SESSION_CURSOR_INVALID', 'Invalid replay sequence.');
      if (streams.size >= 32 || (perActor.get(principal) ?? 0) >= 8)
        return reply.code(429).header('Retry-After', '5').send({ error: 'rate_limited' });
      const controller = new AbortController();
      const wakeup = createStreamWakeup((listener) => coordinator.store.subscribe(sid, listener));
      streams.add(controller);
      perActor.set(principal, (perActor.get(principal) ?? 0) + 1);
      const raw = reply.raw;
      reply.hijack();
      const disconnected = () => controller.abort();
      raw.on('close', disconnected);
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      raw.write(': connected\n\n');
      let heartbeat = Date.now();
      let observed = -1;
      let draining = true;
      try {
        while (!controller.signal.aborted) {
          request.authz = request.authz.refresh();
          await authorizeSession(request, coordinator, sid);
          if (Date.now() - heartbeat >= 15000) {
            raw.write(': heartbeat\n\n');
            heartbeat = Date.now();
          }
          const current = wakeup.revision();
          if (!draining && observed === current) {
            await wakeup.wait(observed, controller.signal, 1000);
            continue;
          }
          observed = current;
          const batch = await coordinator.store.call<EventBatch>({
            op: 'events',
            sessionId: sid,
            after,
          });
          if (after < batch.oldest - 1 || raw.writableLength > SessionLimits.subscriberBytes) {
            raw.write('event: resync-required\ndata: {}\n\n');
            break;
          }
          for (const event of batch.events) {
            if (event.eventSeq !== after + 1) {
              raw.write('event: resync-required\ndata: {}\n\n');
              controller.abort();
              break;
            }
            const frame =
              'id: ' +
              event.eventSeq +
              '\nevent: session-change\ndata: ' +
              JSON.stringify(effectiveEvent(event, request, coordinator.provider)) +
              '\n\n';
            if (!raw.write(frame)) await once(raw, 'drain', { signal: controller.signal });
            after = event.eventSeq;
          }
          draining = batch.events.length > 0;
          if (!draining) await wakeup.wait(observed, controller.signal, 1000);
        }
      } catch {
        /* Auth revocation, disconnect and shutdown close the stream without more data. */
      } finally {
        wakeup.close();
        streams.delete(controller);
        const left = (perActor.get(principal) ?? 1) - 1;
        if (left) perActor.set(principal, left);
        else perActor.delete(principal);
        raw.off('close', disconnected);
        if (!raw.writableEnded) raw.end();
      }
    },
  };
}
