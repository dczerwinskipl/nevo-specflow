import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { AGENT_CAPABILITY_PREFIX } from '@nevo/specflow-contracts/runtime';
import type { AgentWriteActor, AgentWriteScope } from '@nevo/specflow-engine';

const CAPABILITY_BYTES = 32;

/** Ended capabilities kept to word their refusal ("the Turn ended") before they are forgotten. */
const ENDED_KEPT = 256;
/** How long `revoke` waits for the broker calls already running before it gives up waiting. */
const DRAIN_MS = 30_000;

/** What a capability is bound to: the trusted facts of the Turn, never anything the agent sent. */
export interface CapabilityBinding {
  readonly invocationId: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly specId: string;
  /** A Task subject (the attempt scope); absent for an ad-hoc Turn. */
  readonly taskId?: string;
  /** The workspace root the Engine claimed for the invocation. */
  readonly workspace: string;
  readonly scope: AgentWriteScope;
  /** The agent every write of the Turn is made as (`AgentActor`), from the Turn's selection. */
  readonly actor: AgentWriteActor;
}

export type CapabilityState = 'minted' | 'active' | 'ended';

interface Entry {
  readonly value: Buffer;
  readonly binding: CapabilityBinding;
  state: CapabilityState;
  /** Broker calls running under the capability. */
  inFlight: number;
  drained: (() => void)[];
}

export type CapabilityCheck =
  | { readonly status: 'valid'; readonly binding: CapabilityBinding }
  | { readonly status: 'unknown' | 'not-dispatched' | 'ended' };

/** One broker call admitted under a running Turn's capability. */
export interface CapabilityLease {
  readonly binding: CapabilityBinding;
  /** Whether the Turn still runs (checked again right before the Engine is called). */
  active(): boolean;
  /** Idempotent. */
  release(): void;
}

export type CapabilityAdmission =
  | { readonly status: 'valid'; readonly lease: CapabilityLease }
  | { readonly status: 'unknown' | 'not-dispatched' | 'ended' };

export interface CapabilityHandle {
  readonly value: string;
  activate(): void;
  /**
   * Admits nothing more at once, then waits (bounded) for the broker calls already running, so a
   * write either completes before the claim settles or is refused. Idempotent.
   */
  revoke(): Promise<void>;
}

/**
 * The capabilities of this Runtime process: minted per write Turn, never persisted, compared in
 * constant time. A capability admits requests only between `activate` (its claim is dispatched)
 * and `revoke` (the Turn ends); one invocation holds at most one.
 */
export function createCapabilityRegistry(
  options: {
    random?: (size: number) => Buffer;
    /** Bound of the drain wait (tests). */
    drainMs?: number;
  } = {},
) {
  const random = options.random ?? randomBytes;
  const drainMs = options.drainMs ?? DRAIN_MS;
  /** Keyed by the sha256 of the value: the lookup never compares secret bytes. */
  const entries = new Map<string, Entry>();
  const invocations = new Set<string>();
  const ended: string[] = [];
  const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

  function forgetEnded(key: string) {
    ended.push(key);
    while (ended.length > ENDED_KEPT) {
      const old = ended.shift()!;
      const entry = entries.get(old);
      if (entry?.inFlight === 0) {
        invocations.delete(entry.binding.invocationId);
        entries.delete(old);
      }
    }
  }

  function lookup(presented: string): Entry | undefined {
    const bytes = Buffer.from(presented);
    const entry = entries.get(digest(bytes));

    return entry?.value.length === bytes.length && timingSafeEqual(entry.value, bytes)
      ? entry
      : undefined;
  }

  function drain(entry: Entry): Promise<void> {
    if (entry.inFlight === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const timer = setTimeout(done, drainMs);
      timer.unref?.();
      function done() {
        clearTimeout(timer);
        resolve();
      }

      entry.drained.push(done);
    });
  }

  return {
    mint(binding: CapabilityBinding): CapabilityHandle {
      if (invocations.has(binding.invocationId)) {
        throw new Error('The invocation already holds a capability.');
      }

      const value = AGENT_CAPABILITY_PREFIX + random(CAPABILITY_BYTES).toString('base64url');
      const bytes = Buffer.from(value);
      const key = digest(bytes);
      const entry: Entry = { value: bytes, binding, state: 'minted', inFlight: 0, drained: [] };
      entries.set(key, entry);
      invocations.add(binding.invocationId);

      return {
        value,
        activate() {
          if (entry.state === 'minted') {
            entry.state = 'active';
          }
        },
        revoke() {
          if (entry.state !== 'ended') {
            entry.state = 'ended';
            forgetEnded(key);
          }

          return drain(entry);
        },
      };
    },

    /** The binding of a presented value while its Turn runs, or why it admits nothing. */
    check(presented: string): CapabilityCheck {
      const entry = lookup(presented);
      if (!entry) {
        return { status: 'unknown' };
      }

      if (entry.state === 'minted') {
        return { status: 'not-dispatched' };
      }

      return entry.state === 'ended'
        ? { status: 'ended' }
        : { status: 'valid', binding: entry.binding };
    },

    /** Admits one broker call: counted until released, so `revoke` waits for it. */
    enter(presented: string): CapabilityAdmission {
      const entry = lookup(presented);
      if (!entry) {
        return { status: 'unknown' };
      }

      if (entry.state !== 'active') {
        return { status: entry.state === 'minted' ? 'not-dispatched' : 'ended' };
      }

      entry.inFlight += 1;
      let released = false;

      return {
        status: 'valid',
        lease: {
          binding: entry.binding,
          active: () => entry.state === 'active',
          release() {
            if (released) {
              return;
            }

            released = true;
            entry.inFlight -= 1;
            if (entry.inFlight === 0) {
              for (const done of entry.drained.splice(0)) {
                done();
              }
            }
          },
        },
      };
    },
  };
}

export type CapabilityRegistry = ReturnType<typeof createCapabilityRegistry>;
