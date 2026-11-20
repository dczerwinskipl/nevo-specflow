import { describe, expect, it } from 'vitest';

import { REDACTED_CAPABILITY, redactCapabilities } from './redaction';
import { createCapabilityRegistry } from './registry';

describe('capability redaction', () => {
  const registry = createCapabilityRegistry();
  const minted = registry.mint({
    invocationId: 'i-1',
    sessionId: 's-1',
    turnId: 't-1',
    specId: 'S1',
    workspace: '/w',
    scope: { kind: 'ad-hoc', specId: 'S1', operations: ['documents.save'] },
    actor: { class: 'agent', details: { provider: 'claude', sessionId: 's-1' } },
  }).value;

  it('mints 256 random bits behind a recognisable prefix', () => {
    expect(minted).toMatch(/^nvcap_[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(minted.slice(6), 'base64url')).toHaveLength(32);
  });

  it('removes the value in its plain, JSON-escaped and URL-encoded forms', () => {
    const text = [
      `NEVO_AGENT_CAPABILITY=${minted}`,
      JSON.stringify({ env: minted }),
      `?c=${encodeURIComponent(minted)}`,
    ].join('\n');
    const redacted = redactCapabilities(text, [minted]);
    expect(redacted).not.toContain(minted);
    expect(redacted.split(REDACTED_CAPABILITY)).toHaveLength(4);
  });

  it('removes a capability this process never minted (another Runtime, an earlier Turn)', () => {
    const other = 'nvcap_' + 'A'.repeat(43);
    expect(redactCapabilities(`token ${other} end`)).toBe(`token ${REDACTED_CAPABILITY} end`);
  });

  it('leaves text without a capability unchanged', () => {
    expect(redactCapabilities('nothing secret here', [minted])).toBe('nothing secret here');
  });
});
