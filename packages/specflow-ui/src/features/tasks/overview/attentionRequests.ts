/**
 * Requests from a Requires attention action to the Tasks flow that carries it out on the Overview
 * (a first-start confirmation, a cancel confirmation, a direct start, the Specification's Return
 * dialog). An attention entry is plain data built outside React, so its click hands the request to
 * whichever owner listens for that Specification; the listener acts in the click's own call stack
 * (an event handler), never in an effect reacting to state.
 */
export type TaskAttentionRequest =
  | { readonly kind: 'start-step'; readonly taskId: string }
  | { readonly kind: 'first-start'; readonly taskId: string }
  | { readonly kind: 'cancel-task'; readonly taskId: string }
  | { readonly kind: 'return-to-step' };

type Listener = (request: TaskAttentionRequest) => boolean;

const listeners = new Map<string, Set<Listener>>();

/**
 * Hands a request to the listeners of the Specification; `true` once one of them took it. A
 * listener takes only the kinds it owns (the Overview's Now block takes Return).
 */
export function requestTaskAttention(specId: string, request: TaskAttentionRequest): boolean {
  for (const listener of listeners.get(specId) ?? []) {
    if (listener(request)) {
      return true;
    }
  }

  return false;
}

/** Listens for the Specification's requests until the returned function is called. */
export function subscribeTaskAttention(specId: string, listener: Listener): () => void {
  const set = listeners.get(specId) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(specId, set);

  return () => {
    set.delete(listener);
    if (set.size === 0) {
      listeners.delete(specId);
    }
  };
}
