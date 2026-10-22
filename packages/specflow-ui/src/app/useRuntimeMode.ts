import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';

export const runtimeKeys = { info: ['runtime-info'] as const };

/**
 * How the connected Runtime serves data. `unavailable` is a failed Runtime info read: it is never
 * assumed to be `project` (or `demo`), so callers do not silently pick a data source.
 */
export type RuntimeMode = 'loading' | 'project' | 'demo' | 'unavailable';

/**
 * The single observer configuration of `GET /api/runtime/info`; every reader of this key goes
 * through it so the cache entry is observed with one set of options.
 */
export function useRuntimeInfo() {
  const router = useRouter({ warn: false });
  const services = router?.options.context?.services;
  return useQuery({
    queryKey: runtimeKeys.info,
    queryFn: ({ signal }) => services.runtimeInfoApi.getInfo(signal),
    enabled: Boolean(services),
    // The data mode of a running Runtime does not change.
    staleTime: 10 * 60 * 1000,
  });
}

/** The single reader of the Runtime mode; every mode decision goes through it. */
export function useRuntimeMode(): RuntimeMode {
  const runtime = useRuntimeInfo();
  if (runtime.data) return runtime.data.dataMode;
  return runtime.isError ? 'unavailable' : 'loading';
}
