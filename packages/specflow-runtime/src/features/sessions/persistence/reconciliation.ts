import type { StoreDatabase } from './database';
import type { StoredTurn, StoreCommand, EffectRecoveryCandidate } from './protocol';
import { decode, fail } from './encoding';
import { validateDriverFact } from '../providers/facts';
import type { createRequestJournal } from './requests';

type Reconcile = Extract<StoreCommand, { op: 'reconcile-effect' }>;
interface Dependencies extends StoreDatabase, ReturnType<typeof createRequestJournal> {
  turn(this: void, id: string, sessionId: string): StoredTurn;
  applyFact(
    this: void,
    command: Extract<StoreCommand, { op: 'fact' }>,
    effectVerified?: boolean,
  ): boolean;
}
export function createEffectReconciliation(db: Dependencies) {
  function candidates(
    c: Extract<StoreCommand, { op: 'effect-candidates' }>,
  ): EffectRecoveryCandidate[] {
    const rows = db.all(
      `SELECT id,session,data FROM turns WHERE state!='terminal'
      AND json_extract(data,'$.effectBinding') IS NOT NULL
      AND (? IS NULL OR session=?) AND (? IS NULL OR id=?) AND session>?
      ORDER BY session LIMIT 40`,
      c.sessionId ?? null,
      c.sessionId ?? null,
      c.turnId ?? null,
      c.turnId ?? null,
      c.afterSession ?? '',
    );
    return rows.map((row) => {
      const turn = decode<StoredTurn>(row);
      if (!turn.effectBinding || !/^[0-9a-f]{64}$/.test(turn.effectBinding))
        return fail('SESSION_RECOVERY_REQUIRED', 'Execution binding evidence is invalid.');
      const context = db.get(
        'SELECT dispatched,workspace FROM provider_contexts WHERE session=?',
        String(row.session),
      );
      const session = decode<{ nativeWorkspaceIdentity?: string }>(
        db.get('SELECT data FROM sessions WHERE id=?', String(row.session)),
      );
      return {
        sessionId: String(row.session),
        turnId: String(row.id),
        invocationId: turn.invocationId,
        binding: turn.effectBinding,
        nativeDispatched: Number(context?.dispatched) === 1,
        workspace: String(context?.workspace ?? ''),
        ...(session.nativeWorkspaceIdentity
          ? { workspaceIdentity: session.nativeWorkspaceIdentity }
          : {}),
      };
    });
  }
  function reconcile(c: Reconcile) {
    const scope = c.sessionId + ':' + c.turnId,
      input = { requestId: c.requestId };
    const previous = db.request(c.actor, 'reconcile', scope, c.requestId, input);
    if (previous) return previous;
    const turn = db.turn(c.turnId, c.sessionId);
    if (turn.invocationId !== c.invocationId || turn.effectBinding !== c.binding)
      fail(
        'SESSION_RECOVERY_REQUIRED',
        'Execution receipt belongs to another invocation or binding.',
      );
    const context = db.get(
      'SELECT confirmed,dispatched FROM provider_contexts WHERE session=?',
      c.sessionId,
    );
    if (
      !context ||
      (c.source === 'not-dispatched' && Number(context.dispatched) !== 0) ||
      (c.outcome === 'completed' &&
        (Number(context.confirmed) !== 1 || Number(context.dispatched) !== 1))
    )
      fail(
        'SESSION_RECOVERY_REQUIRED',
        'Native dispatch/correlation evidence contradicts recovery.',
      );
    if (turn.summary.state === 'terminal') {
      if (turn.summary.outcome !== c.outcome)
        fail('SESSION_RECOVERY_REQUIRED', 'Canonical outcome contradicts the execution receipt.');
      return { turnId: c.turnId, outcome: turn.summary.outcome, reconciled: false };
    }
    const outcome = {
      kind: 'outcome' as const,
      outcome: c.outcome,
      ...(c.error ? { error: c.error } : {}),
    };
    validateDriverFact(outcome);
    let seq = Number(
      db.get('SELECT MAX(seq) AS seq FROM facts WHERE invocation=?', c.invocationId)?.seq ?? 0,
    );
    const base = {
      op: 'fact' as const,
      sessionId: c.sessionId,
      turnId: c.turnId,
      invocationId: c.invocationId,
    };
    if (c.recovered)
      db.applyFact({
        ...base,
        driverSeq: ++seq,
        fact: {
          kind: 'text',
          key: 'runtime-recovery',
          channel: 'commentary',
          text:
            c.source === 'not-dispatched'
              ? 'Runtime recovered an operation that never reached provider launch.'
              : 'Runtime recovered a verified execution outcome. Output not persisted before interruption is unavailable.',
        },
      });
    db.applyFact({ ...base, driverSeq: seq + 1, fact: outcome }, true);
    const settled = db.turn(c.turnId, c.sessionId).summary;
    if (settled.state !== 'terminal')
      fail('SESSION_RECOVERY_REQUIRED', 'Verified outcome was not committed.');
    const result = { turnId: c.turnId, outcome: settled.outcome, reconciled: true };
    db.remember(c.actor, 'reconcile', scope, c.requestId, input, result);
    return result;
  }
  return { candidates, reconcile };
}
