import {
  OIDC_PROVIDER_ID_MAX_LENGTH,
  OIDC_PROVIDER_NAME_MAX_LENGTH,
} from '@nevo/specflow-contracts/authentication';

export { OIDC_PROVIDER_ID_MAX_LENGTH, OIDC_PROVIDER_NAME_MAX_LENGTH };

export function isValidOidcProviderId(value: string): boolean {
  if (value.length === 0 || value.length > OIDC_PROVIDER_ID_MAX_LENGTH) return false;
  if (value[0] === '-' || value[value.length - 1] === '-') return false;

  for (const char of value) {
    const isAsciiLetter = char >= 'a' && char <= 'z';
    const isDigit = char >= '0' && char <= '9';
    if (!isAsciiLetter && !isDigit && char !== '-') return false;
  }

  return true;
}

export function oidcProviderIdFromName(name: string): string {
  let result = '';
  let separatorPending = false;

  for (const char of name.trim().toLowerCase()) {
    const isAsciiLetter = char >= 'a' && char <= 'z';
    const isDigit = char >= '0' && char <= '9';

    if (!isAsciiLetter && !isDigit) {
      if (result.length > 0) separatorPending = true;
      continue;
    }

    if (separatorPending && result.length > 0 && result.length + 1 < OIDC_PROVIDER_ID_MAX_LENGTH) {
      result += '-';
    }

    if (result.length >= OIDC_PROVIDER_ID_MAX_LENGTH) break;
    result += char;
    separatorPending = false;

    if (result.length >= OIDC_PROVIDER_ID_MAX_LENGTH) break;
  }

  return result;
}

export function normalizeOidcProviderName(value: string): string {
  return value.trim();
}

export function isValidOidcProviderName(value: string): boolean {
  const normalized = normalizeOidcProviderName(value);
  if (normalized.length === 0 || [...normalized].length > OIDC_PROVIDER_NAME_MAX_LENGTH) {
    return false;
  }

  for (const char of normalized) {
    const codePoint = char.codePointAt(0);
    if (codePoint !== undefined && (codePoint < 0x20 || codePoint === 0x7f)) {
      return false;
    }
  }

  return true;
}

export function oidcProviderNameKey(value: string): string {
  return normalizeOidcProviderName(value).toLowerCase();
}
