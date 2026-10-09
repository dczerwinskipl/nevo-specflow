import { describe, expect, it, vi } from 'vitest';
import { recoverTaskPreviewAuthorization } from './recoverTaskPreviewAuthorization';

describe('Task Preview session-expiry routing policy', () => {
  it('redirects to login when a renewed session requires authentication', async () => {
    const onLogin = vi.fn();
    const retry = vi.fn();
    await recoverTaskPreviewAuthorization({
      refresh: async () => ({ authenticationRequired: true, authenticated: false }),
      retry,
      onLogin,
      onRuntimeUnavailable: vi.fn(),
    });
    expect(onLogin).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
  });

  it('retries the detail read after a successful session refresh', async () => {
    const retry = vi.fn();
    const onLogin = vi.fn();
    await recoverTaskPreviewAuthorization({
      refresh: async () => ({ authenticationRequired: true, authenticated: true }),
      retry,
      onLogin,
      onRuntimeUnavailable: vi.fn(),
    });
    expect(retry).toHaveBeenCalledOnce();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('does not force a login when authentication is disabled', async () => {
    const retry = vi.fn();
    await recoverTaskPreviewAuthorization({
      refresh: async () => ({ authenticationRequired: false, authenticated: false }),
      retry,
      onLogin: vi.fn(),
      onRuntimeUnavailable: vi.fn(),
    });
    expect(retry).toHaveBeenCalledOnce();
  });

  it('routes refresh failure to runtime unavailable rather than exposing Task data', async () => {
    const onRuntimeUnavailable = vi.fn();
    const retry = vi.fn();
    await recoverTaskPreviewAuthorization({
      refresh: async () => Promise.reject(new Error('Runtime unavailable')),
      retry,
      onLogin: vi.fn(),
      onRuntimeUnavailable,
    });
    expect(onRuntimeUnavailable).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
  });
});
