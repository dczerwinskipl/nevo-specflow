import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type { AgentWriteScope } from '@nevo/specflow-engine';

/** A capability value: a fixed prefix (so redaction recognises one it never minted) and 256 random bits. */
export const CAPABILITY_PREFIX = 'nvcap_';
const CAPABILITY_BYTES = 32;
export const CAPABILITY_PATTERN = /nvcap_[A-Za-z0-9_-]{43}/g;

/** Ended capabilities kept to word their refusal ("the Turn ended") before they are forgotten. */
const ENDED_KEPT = 256;
/** Operations remembered per author; the oldest are forgotten (and count as another author's). */
const AUTHORED_KEPT = 4096;

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
  /**
   * Whose operations count as the same author for the foreign-ledger rule: the Session for an
   * ad-hoc Turn (its Turns are one conversation), the attempt once attempts exist.
   */
  readonly author: string;
}

export type CapabilityState = 'minted' | 'active' | 'ended';

interface Entry {
  readonly value: Buffer;
  readonly binding: CapabilityBinding;
  state: CapabilityState;
}

export type CapabilityCheck =
  | { readonly status: 'valid'; readonly binding: CapabilityBinding }
  | { readonly status: 'unknown' | 'not-dispatched' | 'ended' };

export interface CapabilityHandle {
  readonly value: string;
  activate(): void;
  revoke(): void;
}

/**
 * The capabilities of this Runtime process: minted per write Turn, never persisted, compared in
 * constant time. A capability admits requests only between `activate` (its claim is dispatched)
 * and `revoke` (the Turn ends); one invocation holds at most one.
 */
export function createCapabilityRegistry(options: { random?: (size: number) => Buffer } = {}) {
  const random = options.random ?? randomBytes;
  /** Keyed by the sha256 of the value: the lookup never compares secret bytes. */
  const entries = new Map<string, Entry>();
  const invocations = new Set<string>();
  const ended: string[] = [];
  const authored = new Map<string, Set<string>>();
  const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

  function forgetEnded(key: string) {
    ended.push(key);
    while (ended.length > ENDED_KEPT) {
      const old = ended.shift()!;
      const entry = entries.get(old);
      if (entry) {
        invocations.delete(entry.binding.invocationId);
        entries.delete(old);
      }
    }
  }

  return {
    mint(binding: CapabilityBinding): CapabilityHandle {
      if (invocations.has(binding.invocationId)) {
        throw new Error('The invocation already holds a capability.');
      }

      const value = CAPABILITY_PREFIX + random(CAPABILITY_BYTES).toString('base64url');
      const bytes = Buffer.from(value);
      const key = digest(bytes);
      const entry: Entry = { value: bytes, binding, state: 'minted' };
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
        },
      };
    },

    /** The binding of a presented value while its Turn runs, or why it admits nothing. */
    check(presented: string): CapabilityCheck {
      const bytes = Buffer.from(presented);
      const entry = entries.get(digest(bytes));
      if (entry?.value.length !== bytes.length || !timingSafeEqual(entry.value, bytes)) {
        return { status: 'unknown' };
      }

      if (entry.state === 'minted') {
        return { status: 'not-dispatched' };
      }

      return entry.state === 'ended'
        ? { status: 'ended' }
        : { status: 'valid', binding: entry.binding };
    },

    /** Records an Engine operation the broker runs for `author` (before it runs). */
    recordAuthored(author: string, operationId: string) {
      let set = authored.get(author);
      if (!set) {
        set = new Set();
        authored.set(author, set);
      }

      set.delete(operationId);
      set.add(operationId);
      while (set.size > AUTHORED_KEPT) {
        set.delete(set.values().next().value!);
      }
    },

    isAuthored(author: string, operationId: string): boolean {
      return authored.get(author)?.has(operationId) === true;
    },
  };
}

export type CapabilityRegistry = ReturnType<typeof createCapabilityRegistry>;
