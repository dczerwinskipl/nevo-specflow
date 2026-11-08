import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import {
  ArchiveSessionSchema,
  RenameSessionSchema,
  SessionCommandResultSchema,
} from './management';
import { SessionErrorSchema } from './commands';
import { SessionInfoSchema } from './model';
import { SessionCapabilities } from './capabilities';
import { sessionValidators } from './validation';

const id = '10000000-0000-4000-8000-000000000001';
const date = '2026-11-08T00:00:00.000Z';
const session = {
  sessionId: id,
  projectId: 'project',
  providerId: 'mock',
  mode: 'read-only',
  readiness: 'ready',
  capabilities: {
    view: true,
    manage: true,
    start: false,
    cancel: false,
    questions: true,
    permissions: true,
    delete: true,
  },
  archivedAt: date,
  createdAt: date,
  updatedAt: date,
};

describe('Session management contract', () => {
  it('bounds rename titles to nonblank text of at most 256 characters and rejects extra keys', () => {
    expect(Value.Check(RenameSessionSchema, { requestId: id, title: 'Plan review' })).toBe(true);
    expect(Value.Check(RenameSessionSchema, { requestId: id, title: 'x'.repeat(256) })).toBe(true);
    expect(Value.Check(RenameSessionSchema, { requestId: id, title: 'x'.repeat(257) })).toBe(false);
    expect(Value.Check(RenameSessionSchema, { requestId: id, title: '' })).toBe(false);
    expect(Value.Check(RenameSessionSchema, { requestId: id, title: ' \t\n' })).toBe(false);
    expect(Value.Check(RenameSessionSchema, { requestId: id })).toBe(false);
    expect(Value.Check(RenameSessionSchema, { requestId: id, title: 'a', extra: 1 })).toBe(false);
  });
  it('accepts archive and unarchive with only a request ID', () => {
    expect(Value.Check(ArchiveSessionSchema, { requestId: id })).toBe(true);
    expect(Value.Check(ArchiveSessionSchema, { requestId: 'not-a-uuid' })).toBe(false);
    expect(Value.Check(ArchiveSessionSchema, { requestId: id, force: true })).toBe(false);
  });
  it('returns a closed effective Session projection with archive state and delete capability', () => {
    expect(Value.Check(SessionInfoSchema, session)).toBe(true);
    expect(sessionValidators.sessionCommandResult({ session })).toBe(true);
    expect(Value.Check(SessionCommandResultSchema, { session, turnId: id })).toBe(false);
    expect(sessionValidators.sessionCommandResult({ session: { ...session, deleted: true } })).toBe(
      false,
    );
    const { archivedAt: _archived, ...active } = session;
    expect(sessionValidators.sessionCommandResult({ session: active })).toBe(true);
  });
  it.each(['SESSION_ARCHIVED', 'SESSION_DELETE_BLOCKED'])('declares %s', (code) => {
    expect(
      Value.Check(SessionErrorSchema, { error: 'session_error', code, message: 'Refused.' }),
    ).toBe(true);
  });
  it('declares the session.delete capability', () => {
    expect(SessionCapabilities.capabilities.Delete).toBe('session.delete');
  });
});
