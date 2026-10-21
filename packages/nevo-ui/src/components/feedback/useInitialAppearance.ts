import { useLayoutEffect, useRef } from 'react';

/** A committed initial placeholder may reveal its first result once; refetches never replay it. */
export function useInitialAppearance(identity: string, loading: boolean, ready: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const state = useRef({ identity, placeholder: false, resolved: false });
  useLayoutEffect(() => {
    if (state.current.identity !== identity)
      state.current = { identity, placeholder: false, resolved: false };
    if (loading && !state.current.resolved) state.current.placeholder = true;
    if (!ready || state.current.resolved) return;
    state.current.resolved = true;
    const node = ref.current;
    if (!state.current.placeholder || !node) return;
    const workspace = node.closest('[data-workspace-motion]');
    if (workspace && workspace.getAttribute('data-workspace-motion') !== 'idle') return;
    node.classList.add('initial-content-appearance');
    return () => node.classList.remove('initial-content-appearance');
  }, [identity, loading, ready]);
  return ref;
}
