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

import { NevoBrandLogo } from '../brand';
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
      <main
        className="grid w-full max-w-md gap-8"
        {...capture}
        {...designSlot('SpecFlowLoginScreen', 'content')}
      >
        <div className="grid justify-items-start gap-6">
          <NevoBrandLogo brand="nevo" product="SpecFlow" size="lg" type="horizontal" />
          <div className="grid gap-2">
            <Typography as="h1" variant="title-lg">
              Sign in
            </Typography>
            <Typography className="text-content-secondary" variant="body-md">
              Sign in to continue to SpecFlow.
            </Typography>
          </div>
        </div>

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
                  disabled={busy}
                  title={provider.name}
                  variant={oidcButtonVariant(loginMethods)}
                  width="full"
                  onClick={() => void onOidc?.(provider.id)}
                >
                  {providerPending ? `Opening ${provider.name}…` : `Continue with ${provider.name}`}
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
          <form className="grid gap-5" onSubmit={handleSubmit}>
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
      </main>
    </StandaloneAuthSurface>
  );
}

function StandaloneAuthSurface({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface text-content-primary">
      <div className="mx-auto flex min-h-dvh w-full max-w-screen-sm items-start justify-center px-5 pb-10 pt-12 sm:items-center sm:px-8 sm:py-12">
        {children}
      </div>
    </div>
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
