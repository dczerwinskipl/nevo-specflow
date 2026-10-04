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

import { StandaloneAuthHeader, StandaloneAuthSurface } from './StandaloneAuthLayout';
import { authErrorCode } from './api';
import type { AuthStore } from './store';

export interface LoginScreenProps {
  readonly auth: AuthStore;
  readonly returnTo?: string;
  readonly initialError?: string;
}

export function LoginScreen({ auth, initialError, returnTo = '/' }: LoginScreenProps) {
  const state = useSyncExternalStore(
    (listener) => auth.subscribe(listener),
    () => auth.getState(),
    () => auth.getState(),
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>(
    initialError ? loginErrorMessage(initialError) : undefined,
  );
  const [pending, setPending] = useState<string | undefined>();

  if (state.status !== 'ready') {
    return (
      <StandaloneAuthSurface>
        <div className="flex justify-center py-12">
          <Spinner label="Loading sign in" />
        </div>
      </StandaloneAuthSurface>
    );
  }

  if (state.session.authenticated || !state.session.authenticationRequired) {
    return null;
  }

  const submitPassword = async () => {
    setError(undefined);
    setPending('password');
    try {
      await auth.loginWithPassword(username, password);
      window.location.assign(safeReturnTo(returnTo));
    } catch (caught) {
      setError(loginErrorMessage(authErrorCode(caught) ?? 'service_unavailable'));
      setPending(undefined);
    }
  };

  const startOidc = async (providerId: string) => {
    setError(undefined);
    setPending(`oidc:${providerId}`);
    try {
      const authorizationUrl = await auth.startOidc(providerId, safeReturnTo(returnTo));
      window.location.assign(authorizationUrl);
    } catch (caught) {
      setError(loginErrorMessage(authErrorCode(caught) ?? 'provider_unavailable'));
      setPending(undefined);
    }
  };

  return (
    <LoginScreenView
      error={error}
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
  const capture = useDesignMetadata('SpecFlowLoginScreen');
  const hasOidc = loginMethods.oidc.length > 0;
  const hasPassword = loginMethods.password.enabled;
  const busy = pending !== undefined;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onPasswordSubmit?.();
  };

  return (
    <StandaloneAuthSurface>
      <div
        className="grid w-full gap-8"
        {...capture}
        {...designSlot('SpecFlowLoginScreen', 'content')}
      >
        <StandaloneAuthHeader description="Access your SpecFlow workspace." title="Welcome back" />

        {error ? (
          <Alert role="alert" tone="danger" title="Sign in failed">
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
                      ? `Opening ${provider.name}…`
                      : `Continue with ${provider.name}`}
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
              or
            </Typography>
            <Separator className="flex-1" />
          </div>
        ) : null}

        {hasPassword ? (
          <form className="grid gap-8" onSubmit={handleSubmit}>
            <div className="grid gap-4">
              <Field>
                <Field.Label>Username</Field.Label>
                <TextInput
                  autoComplete="username"
                  disabled={busy}
                  name="username"
                  value={username}
                  onChange={(event) => onUsernameChange?.(event.currentTarget.value)}
                />
              </Field>
              <Field>
                <Field.Label>Password</Field.Label>
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
              {pending === 'password' ? 'Signing in…' : 'Sign in'}
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

export function loginErrorMessage(code: string): string {
  switch (code) {
    case 'invalid_credentials':
      return 'Username or password is incorrect.';
    case 'rate_limited':
      return 'Too many sign-in attempts. Try again later.';
    case 'identity_not_allowed':
      return 'This identity is not allowed to access this SpecFlow project.';
    case 'invalid_oidc_transaction':
      return 'The sign-in request expired or is no longer valid. Start again.';
    case 'oidc_authentication_failed':
      return 'The identity provider could not complete sign in. Try again.';
    case 'provider_unavailable':
      return 'The identity provider is currently unavailable. Try again later.';
    case 'service_unavailable':
    default:
      return 'SpecFlow could not complete sign in. Try again.';
  }
}

export function unauthenticatedSession(loginMethods: AuthLoginMethods): AuthSessionResponse {
  return {
    authenticationRequired: true,
    authenticated: false,
    loginMethods,
  };
}
