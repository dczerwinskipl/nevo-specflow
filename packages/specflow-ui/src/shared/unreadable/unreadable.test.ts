import { HttpClientError } from '@nevo/http-client';
import { describe, expect, it } from 'vitest';
import en from '../../i18n/locales/en.json';
import {
  unreadableCauseOf,
  unreadableCauseOfSection,
  unreadableCopy,
  type UnreadableCause,
} from './unreadable';

const http = (status: number, data?: unknown, headers?: Record<string, string>) =>
  new HttpClientError('failed', { kind: 'http', status, data, headers });

describe('why a read failed', () => {
  it.each([
    [
      'a busy control lock (Retry-After)',
      http(503, { error: 'specification_source_unavailable' }, { 'retry-after': '1' }),
      'busy',
    ],
    [
      'CONTROL_LOCK_BUSY',
      http(503, { error: 'CONTROL_LOCK_BUSY', code: 'CONTROL_LOCK_BUSY' }),
      'busy',
    ],
    [
      'a source it could not read',
      http(503, { error: 'specification_source_unavailable' }),
      'source',
    ],
    [
      'a lock only a recovery releases',
      http(503, {
        error: 'specification_source_unavailable',
        code: 'CONTROL_LOCK_RECOVERY_REQUIRED',
      }),
      'recovery',
    ],
    ['no answer', new HttpClientError('offline', { kind: 'network' }), 'unreachable'],
    ['an unexpected server error', http(500), 'failed'],
    ['not an HTTP failure', new Error('boom'), 'failed'],
  ] as const)('%s', (_name, error, cause) => {
    expect(unreadableCauseOf(error)).toBe(cause);
  });

  it('names every cause in plain words, never "not supported"', () => {
    for (const cause of [
      'busy',
      'recovery',
      'source',
      'unreachable',
      'failed',
    ] as UnreadableCause[]) {
      const copy = unreadableCopy(cause);
      const [, group, name] = copy.description.split('.');
      const text = (en.unreadable as Record<string, Record<string, string>>)[group!]![name!];
      expect(text).toBeTruthy();
      expect(text).not.toMatch(/not supported|not available/i);
    }

    expect(en.unreadable.busy.description).toContain('busy or recovering from a stop');
    // A lock only a recovery releases names the exact command.
    expect(en.unreadable.recovery.description).toContain(
      'nevo-specflow specs documents recover --confirmed-stopped',
    );
  });

  it('reads the cause of a section from its reason', () => {
    expect(unreadableCauseOfSection('source_busy')).toBe('busy');
    expect(unreadableCauseOfSection('source_recovery')).toBe('recovery');
    expect(unreadableCauseOfSection('source_unavailable')).toBe('source');
  });
});
