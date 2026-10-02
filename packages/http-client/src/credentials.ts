import type {
  Awaitable,
  CredentialContext,
  CredentialProvider,
  ResolvedCredentials,
} from './types';

export function anonymousCredentials(): CredentialProvider {
  return {
    resolve: () => undefined,
  };
}

export function cookieCredentials(): CredentialProvider {
  return {
    resolve: () => ({ includeCookies: true }),
  };
}

export function bearerTokenCredentials(
  getAccessToken: () => Awaitable<string | null | undefined>,
): CredentialProvider {
  return {
    async resolve() {
      const token = await getAccessToken();
      if (!token) {
        return undefined;
      }

      return {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      };
    },
  };
}

export function customCredentials(
  resolve: (context: CredentialContext) => Awaitable<ResolvedCredentials | undefined>,
): CredentialProvider {
  return { resolve };
}
