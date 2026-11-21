import { useRouter } from '@tanstack/react-router';

import type { DevicePairingApi } from './api';

/**
 * The pairing API of the routed application, or undefined where there is no Router (an isolated
 * story): a screen that only offers a remedy then keeps its generic answer.
 */
export function useDevicePairingApi(): DevicePairingApi | undefined {
  const router = useRouter({ warn: false }) as
    { options: { context?: { services?: { devicePairingApi?: DevicePairingApi } } } } | undefined;

  return router?.options.context?.services?.devicePairingApi;
}
