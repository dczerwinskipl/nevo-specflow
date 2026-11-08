import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import { CreateSessionSchema, StartTurnSchema, utf8Bytes } from './commands';
import {
  ConversationEntrySchema,
  SessionSnapshotSchema,
  TextPreviewSchema,
  ToolActionSummarySchema,
  TurnSummarySchema,
  WorkPageSchema,
} from './model';

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
  it('accepts optional closed Work counts on a WorkPage and rejects partial or negative counts', () => {
    const page = {
      sessionId: id,
      eventSeq: 1,
      items: [],
      history: { hasOlder: false },
      turn: {
        turnId: id,
        revision: 1,
        createdAt: date,
        updatedAt: date,
        userMessage: message,
        state: 'active',
      },
    };
    const counts = {
      total: 3,
      inProgress: 1,
      byKind: { commentary: 1, reasoning: 0, interaction: 0, tool: 2 },
    };
    expect(Value.Check(WorkPageSchema, page)).toBe(true);
    expect(Value.Check(WorkPageSchema, { ...page, counts })).toBe(true);
    expect(
      Value.Check(WorkPageSchema, { ...page, counts: { ...counts, byKind: { tool: 2 } } }),
    ).toBe(false);
    expect(Value.Check(WorkPageSchema, { ...page, counts: { ...counts, inProgress: -1 } })).toBe(
      false,
    );
    expect(Value.Check(WorkPageSchema, { ...page, counts: { ...counts, extra: 1 } })).toBe(false);
  });
  it('carries a closed Work digest on a conversation entry and a closed tool operation on an action', () => {
    const entry = {
      id,
      ordinal: 1,
      revision: 2,
      turnId: id,
      kind: 'work-summary',
      text: message,
      workId: id,
      createdAt: date,
    };
    expect(Value.Check(ConversationEntrySchema, { ...entry, digest: { done: { read: 2 } } })).toBe(
      true,
    );
    expect(
      Value.Check(ConversationEntrySchema, {
        ...entry,
        digest: { done: { command: 1 }, failed: { command: 1 } },
      }),
    ).toBe(true);
    expect(Value.Check(ConversationEntrySchema, { ...entry, digest: { done: { bash: 1 } } })).toBe(
      false,
    );
    expect(Value.Check(ConversationEntrySchema, { ...entry, digest: { failed: {} } })).toBe(false);
    const action = {
      actionId: id,
      ordinal: 1,
      revision: 1,
      state: 'active',
      title: message,
      createdAt: date,
      updatedAt: date,
    };
    expect(Value.Check(ToolActionSummarySchema, action)).toBe(true);
    expect(Value.Check(ToolActionSummarySchema, { ...action, operation: 'test' })).toBe(true);
    expect(Value.Check(ToolActionSummarySchema, { ...action, operation: 'Bash' })).toBe(false);
  });
});
