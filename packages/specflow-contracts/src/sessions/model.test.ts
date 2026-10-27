import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import { CreateSessionSchema, StartTurnSchema, utf8Bytes } from './commands';
import { SessionSnapshotSchema, TextPreviewSchema, TurnSummarySchema } from './model';

const id = '10000000-0000-4000-8000-000000000001';
const date = '2026-10-25T00:00:00.000Z';
const message = { text: 'Hello', complete: true };
describe('independent managed Session contract', () => {
  it('creates without a Specification or Task and rejects association fields in the core command', () => {
    const input = { requestId: id, providerId: 'mock', mode: 'read-only' };
    expect(Value.Check(CreateSessionSchema, input)).toBe(true);
    expect(Value.Check(CreateSessionSchema, { ...input, specId: 'spec' })).toBe(false);
    expect(Value.Check(StartTurnSchema, { requestId: id, message: 'Continue' })).toBe(true);
  });
  it('requires a terminal outcome and forbids outcome on an active Turn', () => {
    const turn = {
      turnId: id,
      revision: 1,
      createdAt: date,
      updatedAt: date,
      userMessage: message,
    };
    expect(Value.Check(TurnSummarySchema, { ...turn, state: 'terminal' })).toBe(false);
    expect(
      Value.Check(TurnSummarySchema, {
        ...turn,
        state: 'terminal',
        outcome: 'interrupted',
        completedAt: date,
      }),
    ).toBe(true);
    expect(Value.Check(TurnSummarySchema, { ...turn, state: 'active', outcome: 'completed' })).toBe(
      false,
    );
  });
  it('never represents truncated text as a complete body without a continuation', () => {
    expect(Value.Check(TextPreviewSchema, { text: 'Part', complete: false })).toBe(false);
    expect(
      Value.Check(TextPreviewSchema, {
        text: 'Part',
        complete: false,
        content: { contentId: id, revision: '1', byteLength: 10000 },
      }),
    ).toBe(true);
  });
  it('validates an empty settled Session and bounds tail rows', () => {
    const snapshot = {
      revision: 0,
      eventSeq: 0,
      entries: [],
      history: { hasOlder: false },
      session: {
        sessionId: id,
        projectId: 'project',
        providerId: 'mock',
        mode: 'read-only',
        readiness: 'ready',
        capabilities: {
          view: true,
          manage: true,
          start: true,
          cancel: false,
          questions: true,
          permissions: true,
        },
        createdAt: date,
        updatedAt: date,
      },
    };
    expect(Value.Check(SessionSnapshotSchema, snapshot)).toBe(true);
    const entry = {
      id,
      ordinal: 1,
      revision: 1,
      turnId: id,
      kind: 'request',
      text: message,
      createdAt: date,
    };
    expect(
      Value.Check(SessionSnapshotSchema, {
        ...snapshot,
        entries: Array.from({ length: 41 }, () => entry),
      }),
    ).toBe(false);
  });
  it('counts UTF-8 bytes including surrogate pairs and malformed input replacement', () => {
    expect(utf8Bytes('zażółć 😀')).toBe(15);
    expect(utf8Bytes('\ud800')).toBe(3);
  });
});
