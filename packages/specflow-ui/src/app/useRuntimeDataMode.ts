import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';

/** Runtime data mode (`demo` / `project`), or `undefined` while Runtime info is loading. */
export function useRuntimeDataMode() {
  const router = useRouter({ warn: false });
  const services = router?.options.context?.services;
  const runtime = useQuery({
    queryKey: ['runtime-info'],
    queryFn: ({ signal }) => services.runtimeInfoApi.getInfo(signal),
    enabled: Boolean(services),
  });
  return runtime.data?.dataMode;
}
