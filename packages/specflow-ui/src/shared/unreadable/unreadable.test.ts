import { HttpClientError } from '@nevo/http-client';
import { describe, expect, it } from 'vitest';
import en from '../../i18n/locales/en.json';
import { unreadableCauseOf, unreadableCopy, type UnreadableCause } from './unreadable';

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
    ['no answer', new HttpClientError('offline', { kind: 'network' }), 'unreachable'],
    ['an unexpected server error', http(500), 'failed'],
    ['not an HTTP failure', new Error('boom'), 'failed'],
  ] as const)('%s', (_name, error, cause) => {
    expect(unreadableCauseOf(error)).toBe(cause);
  });

  it('names every cause in plain words, never "not supported"', () => {
    for (const cause of ['busy', 'source', 'unreachable', 'failed'] as UnreadableCause[]) {
      const copy = unreadableCopy(cause);
      const [, group, name] = copy.description.split('.');
      const text = (en.unreadable as Record<string, Record<string, string>>)[group!]![name!];
      expect(text).toBeTruthy();
      expect(text).not.toMatch(/not supported|not available/i);
    }

    expect(en.unreadable.busy.description).toContain('busy or recovering from a stop');
  });
});
