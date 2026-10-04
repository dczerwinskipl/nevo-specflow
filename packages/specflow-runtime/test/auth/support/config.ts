import type { RuntimeConfig } from '../../../src/config/types';

export const PASSWORD_HASH =
  '$scrypt$16384$8$5$MDEyMzQ1Njc4OWFiY2RlZg$yMHgG_FDESRF0j5gjhGLotSMPdnfefUcNNFPyNoQtJE';

export function passwordConfig(): RuntimeConfig {
  return {
    server: { host: '127.0.0.1', port: 4318, tls: { enabled: false } },
    auth: {
      mode: 'required',
      users: { 'demo-user': { name: 'Demo User' } },
      providers: {
        password: {
          enabled: true,
          accounts: {
            demo: { userId: 'demo-user', passwordHash: PASSWORD_HASH },
          },
        },
        oidc: { instances: {} },
      },
    },
  };
}

export function oidcConfig(
  allowedEmails: Readonly<Record<string, string>>,
  providerId = 'company',
): RuntimeConfig {
  return {
    server: {
      host: '127.0.0.1',
      port: 4318,
      publicOrigin: 'https://specflow.example.test:4318',
      tls: { enabled: true, certFile: 'cert.pem', keyFile: 'key.pem' },
    },
    auth: {
      mode: 'required',
      users: { 'demo-user': { name: 'Demo User' } },
      providers: {
        password: { enabled: false, accounts: {} },
        oidc: {
          instances: {
            [providerId]: {
              name: 'Company SSO',
              enabled: true,
              issuer: 'https://issuer.example.test',
              clientId: 'client-id',
              clientSecret: 'client-secret',
              allowedEmails,
            },
          },
        },
      },
    },
  };
}

export function noAuthConfig(): RuntimeConfig {
  return {
    server: { host: '127.0.0.1', port: 4318, tls: { enabled: false } },
    auth: {
      mode: 'none',
      localUserId: 'demo-user',
      users: { 'demo-user': { name: 'Demo User' } },
      providers: {
        password: { enabled: false, accounts: {} },
        oidc: { instances: {} },
      },
    },
  };
}
