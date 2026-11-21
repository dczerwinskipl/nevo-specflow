import { createRoute, redirect } from '@tanstack/react-router';
import { rootRoute } from '../app/router/root';
import { resolveLoginAccess } from './access';
import { LoginScreen } from './LoginScreen';
import { RuntimeUnavailableScreen } from './RuntimeUnavailableScreen';
import { resolvePairingAccess, qrTokenFromHash } from './pairing/access';
import { PairDeviceScreen } from './pairing/PairDeviceScreen';
import { safeReturnTo } from './LoginScreen';

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.returnTo === 'string' ? { returnTo: search.returnTo } : {}),
    ...(typeof search.error === 'string' ? { error: search.error } : {}),
  }),
  beforeLoad: async ({ context, search }) => {
    const decision = await resolveLoginAccess(context.auth, search.returnTo);

    if (decision.kind === 'runtime-unavailable') {
      redirect({
        to: '/runtime-unavailable',
        search: { returnTo: decision.returnTo },
        throw: true,
      });
    }

    if (decision.kind === 'app') {
      redirect({ href: decision.returnTo, throw: true });
    }
  },
  component: LoginRouteScreen,
});

export const runtimeUnavailableRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/runtime-unavailable',
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.returnTo === 'string' ? { returnTo: search.returnTo } : {}),
  }),
  component: RuntimeUnavailableRouteScreen,
});

function LoginRouteScreen() {
  const { auth } = loginRoute.useRouteContext();
  const search = loginRoute.useSearch();

  return <LoginScreen auth={auth} initialError={search.error} returnTo={search.returnTo} />;
}

function RuntimeUnavailableRouteScreen() {
  const { auth } = runtimeUnavailableRoute.useRouteContext();
  const search = runtimeUnavailableRoute.useSearch();

  return <RuntimeUnavailableScreen auth={auth} returnTo={search.returnTo} />;
}

export const pairRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pair',
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.returnTo === 'string' ? { returnTo: search.returnTo } : {}),
  }),
  loaderDeps: ({ search }) => ({ returnTo: search.returnTo }),
  loader: async ({ context, location, deps }) => {
    const target = safeReturnTo(deps.returnTo);
    // A scanned QR code carries its one-time token after `#`: take it once and drop it from the
    // address, so it is neither shown nor kept in the history.
    const qrToken = qrTokenFromHash(location.hash);
    if (location.hash) {
      window.history.replaceState(
        window.history.state,
        '',
        `${location.pathname}${location.searchStr}`,
      );
    }

    const status = await resolvePairingAccess(context.services.devicePairingApi);
    if (!status) {
      redirect({ href: target, throw: true });
    }

    return { status, qrToken, returnTo: target };
  },
  component: PairRouteScreen,
});

function PairRouteScreen() {
  const { services } = pairRoute.useRouteContext();
  const { status, qrToken, returnTo } = pairRoute.useLoaderData();

  if (!status) {
    return null;
  }

  return (
    <PairDeviceScreen
      api={services.devicePairingApi}
      status={status}
      qrToken={qrToken}
      onContinue={() => window.location.assign(returnTo)}
    />
  );
}

export const authRoutes = [loginRoute, runtimeUnavailableRoute, pairRoute] as const;
