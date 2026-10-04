import { useState, useSyncExternalStore, type FormEvent } from 'react';

import type {
  AuthLoginMethods,
  AuthSessionResponse,
} from '@nevo/specflow-contracts/authentication';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import {
  Alert,
  Button,
  Field,
  PasswordInput,
  Separator,
  Spinner,
  TextInput,
  Typography,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';

import { appI18n } from '../i18n';
import { StandaloneAuthHeader, StandaloneAuthSurface } from './StandaloneAuthLayout';
import { authErrorCode } from './api';
import type { AuthStore } from './store';

export interface LoginScreenProps {
  readonly auth: AuthStore;
  readonly returnTo?: string;
  readonly initialError?: string;
}

export function LoginScreen({ auth, initialError, returnTo = '/' }: LoginScreenProps) {
  const { t } = useTranslation();
  const state = useSyncExternalStore(
    (listener) => auth.subscribe(listener),
    () => auth.getState(),
    () => auth.getState(),
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorCode, setErrorCode] = useState<string | undefined>(initialError);
  const [pending, setPending] = useState<string | undefined>();

  if (state.status !== 'ready') {
    return (
      <StandaloneAuthSurface>
        <div className="flex justify-center py-12">
          <Spinner label={t('auth.loadingSignIn')} />
        </div>
      </StandaloneAuthSurface>
    );
  }

  if (state.session.authenticated || !state.session.authenticationRequired) {
    return null;
  }

  const submitPassword = async () => {
    setErrorCode(undefined);
    setPending('password');
    try {
      await auth.loginWithPassword(username, password);
      window.location.assign(safeReturnTo(returnTo));
    } catch (caught) {
      setErrorCode(authErrorCode(caught) ?? 'service_unavailable');
      setPending(undefined);
    }
  };

  const startOidc = async (providerId: string) => {
    setErrorCode(undefined);
    setPending(`oidc:${providerId}`);
    try {
      const authorizationUrl = await auth.startOidc(providerId, safeReturnTo(returnTo));
      window.location.assign(authorizationUrl);
    } catch (caught) {
      setErrorCode(authErrorCode(caught) ?? 'provider_unavailable');
      setPending(undefined);
    }
  };

  return (
    <LoginScreenView
      error={errorCode ? t(loginErrorKey(errorCode)) : undefined}
      loginMethods={state.session.loginMethods}
      password={password}
      pending={pending}
      username={username}
      onOidc={startOidc}
      onPasswordChange={setPassword}
      onPasswordSubmit={submitPassword}
      onUsernameChange={setUsername}
    />
  );
}

export interface LoginScreenViewProps {
  readonly loginMethods: AuthLoginMethods;
  readonly username?: string;
  readonly password?: string;
  readonly error?: string;
  readonly pending?: string;
  readonly onUsernameChange?: (value: string) => void;
  readonly onPasswordChange?: (value: string) => void;
  readonly onPasswordSubmit?: () => void | Promise<void>;
  readonly onOidc?: (providerId: string) => void | Promise<void>;
}

export function LoginScreenView({
  error,
  loginMethods,
  onOidc,
  onPasswordChange,
  onPasswordSubmit,
  onUsernameChange,
  password = '',
  pending,
  username = '',
}: LoginScreenViewProps) {
  const { t } = useTranslation();
  const capture = useDesignMetadata('SpecFlowLoginScreen');
  const hasOidc = loginMethods.oidc.length > 0;
  const hasPassword = loginMethods.password.enabled;
  const busy = pending !== undefined;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onPasswordSubmit?.();
  };

  return (
    <StandaloneAuthSurface
      rootAttributes={capture}
      surfaceAttributes={designSlot('SpecFlowLoginScreen', 'content')}
    >
      <div className="grid w-full gap-8">
        <StandaloneAuthHeader
          description={t('auth.login.description')}
          title={t('auth.login.title')}
        />

        {error ? (
          <Alert role="alert" tone="danger" title={t('auth.login.failed')}>
            {error}
          </Alert>
        ) : null}

        {hasOidc ? (
          <div className="grid gap-3">
            {loginMethods.oidc.map((provider) => {
              const providerPending = pending === `oidc:${provider.id}`;
              return (
                <Button
                  key={provider.id}
                  aria-busy={providerPending}
                  className="!h-auto min-h-control-height-default py-control-padding-compact"
                  disabled={busy}
                  variant={oidcButtonVariant(loginMethods)}
                  width="full"
                  onClick={() => void onOidc?.(provider.id)}
                >
                  <span className="block whitespace-normal break-words text-center">
                    {providerPending
                      ? t('auth.login.openingProvider', { provider: provider.name })
                      : t('auth.login.continueWithProvider', { provider: provider.name })}
                  </span>
                </Button>
              );
            })}
          </div>
        ) : null}

        {hasOidc && hasPassword ? (
          <div className="flex items-center gap-3" aria-hidden="true">
            <Separator className="flex-1" />
            <Typography className="text-content-muted" variant="body-sm">
              {t('auth.login.or')}
            </Typography>
            <Separator className="flex-1" />
          </div>
        ) : null}

        {hasPassword ? (
          <form className="grid gap-8" onSubmit={handleSubmit}>
            <div className="grid gap-4">
              <Field>
                <Field.Label>{t('auth.login.username')}</Field.Label>
                <TextInput
                  autoComplete="username"
                  disabled={busy}
                  name="username"
                  value={username}
                  onChange={(event) => onUsernameChange?.(event.currentTarget.value)}
                />
              </Field>
              <Field>
                <Field.Label>{t('auth.login.password')}</Field.Label>
                <PasswordInput
                  autoComplete="current-password"
                  disabled={busy}
                  name="password"
                  value={password}
                  onChange={(event) => onPasswordChange?.(event.currentTarget.value)}
                />
              </Field>
            </div>
            <Button
              aria-busy={pending === 'password'}
              disabled={busy || username.length === 0 || password.length === 0}
              type="submit"
              width="full"
            >
              {pending === 'password' ? t('auth.login.signingIn') : t('auth.login.signIn')}
            </Button>
          </form>
        ) : null}
      </div>
    </StandaloneAuthSurface>
  );
}

export function oidcButtonVariant(loginMethods: AuthLoginMethods): 'primary' | 'secondary' {
  return !loginMethods.password.enabled && loginMethods.oidc.length === 1 ? 'primary' : 'secondary';
}

export function safeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  try {
    const url = new URL(value, 'http://specflow.local');
    if (url.origin !== 'http://specflow.local') return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

export function loginErrorKey(code: string) {
  switch (code) {
    case 'invalid_credentials':
      return 'auth.errors.invalidCredentials';
    case 'rate_limited':
      return 'auth.errors.rateLimited';
    case 'identity_not_allowed':
      return 'auth.errors.identityNotAllowed';
    case 'invalid_oidc_transaction':
      return 'auth.errors.invalidOidcTransaction';
    case 'oidc_authentication_failed':
      return 'auth.errors.oidcAuthenticationFailed';
    case 'provider_unavailable':
      return 'auth.errors.providerUnavailable';
    case 'service_unavailable':
    default:
      return 'auth.errors.serviceUnavailable';
  }
}

export function loginErrorMessage(code: string): string {
  return appI18n.t(loginErrorKey(code));
}

export function unauthenticatedSession(loginMethods: AuthLoginMethods): AuthSessionResponse {
  return {
    authenticationRequired: true,
    authenticated: false,
    loginMethods,
  };
}
