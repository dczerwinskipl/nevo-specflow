import { createHash, scryptSync } from 'node:crypto';
import { SessionError } from '../../errors';
import {
  MAX_NATIVE_CREDENTIAL_BYTES,
  readAntigravityWindowsCredential,
} from './windows-credential';

// Public OAuth client identifier embedded in the native Antigravity consumer profile.
const CONSUMER_AUDIENCE =
  '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';

export interface AntigravityAccount {
  accountScope: string;
  authenticationFingerprint: string;
  source: 'windows-keyring';
  authenticationMode: 'consumer';
}

interface Dependencies {
  /** Returns an owned copy that inspection will clear, including on failure. */
  readCredential(): Buffer;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Unsupported native credential schema.');
  }

  return value as Record<string, unknown>;
}

function boundedString(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum) {
    throw new Error('Unsupported native credential field.');
  }

  return value;
}

/**
 * Local identity binding, not JWT signature verification or remote authentication.
 * Native CLI alone refreshes/authenticates this exact keyring profile. Reinspect
 * before dispatch; same-account token rotation changes only the auth fingerprint.
 */
export function inspectAntigravityAccount(
  options: { signal: AbortSignal },
  dependencies: Dependencies = { readCredential: readAntigravityWindowsCredential },
): Promise<AntigravityAccount> {
  try {
    options.signal.throwIfAborted();
    const bytes = dependencies.readCredential();
    try {
      if (bytes.length < 1 || bytes.length > MAX_NATIVE_CREDENTIAL_BYTES) {
        throw new Error('Unsupported native credential size.');
      }

      const stored = object(JSON.parse(bytes.toString('utf8')) as unknown);
      if (
        stored.auth_method !== 'consumer' ||
        stored.wif_provider ||
        stored.saved_wif_provider ||
        stored.project_id ||
        stored.region
      ) {
        throw new Error('Unsupported native authentication mode.');
      }

      const token = object(stored.token);
      const accessToken = boundedString(token.access_token, MAX_NATIVE_CREDENTIAL_BYTES);
      if (token.token_type !== 'Bearer') {
        throw new Error('Unsupported native token type.');
      }

      // Require the refresh-capable native source; never copy or use its refresh token.
      boundedString(token.refresh_token, MAX_NATIVE_CREDENTIAL_BYTES);
      const jwt = boundedString(stored.id_token, MAX_NATIVE_CREDENTIAL_BYTES).split('.');
      if (jwt.length !== 3 || jwt.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
        throw new Error('Unsupported native identity token.');
      }

      const claims = object(
        JSON.parse(Buffer.from(jwt[1]!, 'base64url').toString('utf8')) as unknown,
      );
      if (
        !['accounts.google.com', 'https://accounts.google.com'].includes(String(claims.iss)) ||
        claims.aud !== CONSUMER_AUDIENCE ||
        (claims.azp !== undefined && claims.azp !== CONSUMER_AUDIENCE)
      ) {
        throw new Error('Unsupported native identity profile.');
      }

      const subject = boundedString(claims.sub, 255);
      options.signal.throwIfAborted();

      return Promise.resolve({
        accountScope: createHash('sha256')
          .update(JSON.stringify(['antigravity:consumer', 'https://accounts.google.com', subject]))
          .digest('hex'),
        authenticationFingerprint: scryptSync(
          accessToken,
          'nevo:antigravity:auth-fingerprint',
          32,
        ).toString('hex'),
        source: 'windows-keyring',
        authenticationMode: 'consumer',
      });
    } finally {
      bytes.fill(0);
    }
  } catch {
    if (options.signal.aborted) {
      return Promise.reject(
        options.signal.reason instanceof Error
          ? options.signal.reason
          : new Error('Account inspection aborted.'),
      );
    }

    return Promise.reject(
      new SessionError(
        'PROVIDER_AUTH_REQUIRED',
        'Antigravity requires its native Windows consumer CLI login. Sign in with agy and recheck the provider.',
      ),
    );
  }
}
