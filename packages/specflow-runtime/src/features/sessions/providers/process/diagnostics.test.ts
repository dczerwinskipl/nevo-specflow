import { describe, expect, it } from 'vitest';
import { createDiagnosticStore, sanitizeDiagnostic } from './diagnostics';
describe('private provider diagnostics', () => {
  it('bounds metadata for blank-line-heavy output as well as payload bytes', () => {
    const store = createDiagnosticStore({
      enabled: true,
      maxInvocationBytes: 65536,
      maxTotalBytes: 65536,
    });
    const capture = store.open('many-lines');
    capture.write('stderr', Buffer.alloc(128 * 1024, 10));
    capture.finish();
    expect(store.read('many-lines')).toEqual({ text: '\n'.repeat(1024), truncated: true });
    expect(store.statistics()).toEqual({ captures: 1, bytes: 1024 });
  });
  it('redacts secrets reconstructed by removing terminal escapes and complex quoted fields', () => {
    expect(sanitizeDiagnostic('sensitive-\x1b[31mvalue', ['sensitive-value'])).not.toContain(
      'sensitive-value',
    );
    const text = sanitizeDiagnostic(
      JSON.stringify({ password: 'one"two' }) +
        ' --token ' +
        JSON.stringify('three"four') +
        ' TOKEN=' +
        JSON.stringify('five six'),
    );
    for (const fragment of ['one', 'two', 'three', 'four', 'five', 'six']) {
      expect(text).not.toContain(fragment);
    }
  });
  it('evicts settled empty records at the metadata cap', () => {
    const store = createDiagnosticStore({ enabled: true });
    for (let n = 0; n < 1100; n++) {
      store.open(String(n)).finish();
    }

    expect(store.statistics()).toEqual({ captures: 1024, bytes: 0 });
  });
  it('redacts resolved secret variants before truncation and strips terminal escapes', () => {
    const secret = 'private / credential';
    const result = sanitizeDiagnostic(
      '\x1b[31m' +
        secret +
        ' ' +
        encodeURIComponent(secret) +
        ' Authorization: Bearer abcdef\n--token=abcdef TOKEN=abcdef {"password":"abcdef"} https://user:pass@example.test\0',
      [secret],
    );
    expect(result).not.toContain(secret);
    expect(result).not.toContain('abcdef');
    expect(result).not.toContain('user:pass');
    expect(result).not.toContain('\x1b');
    expect(result).not.toContain('\0');
    expect(sanitizeDiagnostic('thread.turn.completed')).toBe('thread.turn.completed');
  });
  it('does not retain disabled capture and handles secrets split across chunks', () => {
    const disabled = createDiagnosticStore();
    const unused = disabled.open('a');
    unused.write('stderr', Buffer.from('private\n'));
    unused.finish();
    expect(disabled.statistics()).toEqual({ captures: 0, bytes: 0 });
    const store = createDiagnosticStore({ enabled: true });
    const capture = store.open('a', ['credential']);
    capture.write('stderr', Buffer.from('cred'));
    capture.write('stderr', Buffer.from('ential\n'));
    capture.finish();
    expect(store.read('a')?.text).toBe('[redacted]\n');
  });
  it('drops oversized partial lines, bounds retained bytes and evicts settled evidence', () => {
    const store = createDiagnosticStore({
      enabled: true,
      maxInvocationBytes: 128,
      maxTotalBytes: 180,
    });
    const a = store.open('a');
    a.write('stderr', Buffer.from('a'.repeat(100) + '\n'));
    a.finish();
    const b = store.open('b');
    b.write('stderr', Buffer.from('b'.repeat(100) + '\n'));
    expect(store.read('a')).toBeUndefined();
    expect(store.statistics().bytes).toBeLessThanOrEqual(180);
    b.write('stderr', Buffer.alloc(70000, 120));
    b.write('stderr', Buffer.from('\nafter\n'));
    b.finish();
    expect(store.read('b')).toMatchObject({ truncated: true });
    expect(store.read('b')?.text).toContain('after');
    expect(store.statistics().bytes).toBeLessThanOrEqual(128);
  });
  it('expires settled captures and prevents an old release from deleting a new owner', () => {
    let now = 0;
    const store = createDiagnosticStore({ enabled: true, maxAgeMs: 10, now: () => now });
    const old = store.open('same');
    old.finish();
    old.release();
    const fresh = store.open('same');
    old.release();
    fresh.write('stderr', Buffer.from('fresh\n'));
    fresh.finish();
    expect(store.read('same')?.text).toBe('fresh\n');
    now = 11;
    expect(store.read('same')).toBeUndefined();
    expect(store.statistics()).toEqual({ captures: 0, bytes: 0 });
  });
});
