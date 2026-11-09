import type { ReactNode } from 'react';
import type { SessionAssociationRead } from '@nevo/specflow-contracts/sessions';
import type { StartCatalogue } from '../catalogue/startCatalogue';
import type { AgentChoice } from '../choice/agentChoice';
import type { SessionNameChoice } from '../choice/sessionName';
import type { SentStart } from '../handoff/startedSession';
import type { ContextFact, ContextSpecification } from '../../managed/context/sessionContextTypes';

export type StartCatalogueState =
  | { status: 'loading' }
  /** The catalogue could not be read at all (nothing to choose from): offers to read it again. */
  | { status: 'error'; refresh: () => void }
  | {
      status: 'ready';
      catalogue: StartCatalogue;
      /** The configuration could not be read again: Start waits for a refresh. */
      configurationUnavailable: boolean;
      refresh: () => void;
    };

/**
 * An earlier start whose outcome is unknown, so the form is locked until it is resolved:
 * `retry` resends the same retained request (the managed Runtime), `check` asks what became of it
 * (the demo's allocation), `recover` reads the stored operation first. `checking` while that runs.
 */
export interface SessionStartPending {
  kind: 'retry' | 'check' | 'recover';
  checking: boolean;
}

/**
 * Where a new Session is started from. The start screen only presents and collects; the source owns
 * the catalogue, the request (with its retention, replay and recovery) and the pinned context, so
 * the same screen serves a Specification's New Session in a project Runtime and in the demo.
 */
export interface SessionStartSource {
  /** The signed-in identity the started Session (and its handoff) belongs to. */
  owner: string;
  catalogue: StartCatalogueState;
  /** The Specification the Session is pinned to; absent for a Session without one. */
  specification?: ContextFact<ContextSpecification>;
  /**
   * Starts the Session with what was chosen. Resolves with its id once it exists, and with what the
   * request actually carried (`sent`; a kept request is resent unchanged, whatever the form holds
   * now). `association` is the Session's association as the start established it: it seeds the
   * association read, so the Session's first paint and a reload show the same Context. Rejects when
   * it was not started (the choices stay and the form unlocks, or the pending outcome says why not).
   */
  start: (
    choice: AgentChoice,
    name: SessionNameChoice,
  ) => Promise<{ sessionId: string; sent: SentStart; association?: SessionAssociationRead }>;
  /** Retires the failure the source shows (called when the user edits the choices after it). */
  dismissFailure?: () => void;
  /** An earlier start is unresolved (see {@link SessionStartPending}). */
  pending?: SessionStartPending;
  /**
   * What the source shows in place of the generic failure alert (the demo's classified failure with
   * its remedies). Rendered in the form, above its action row.
   */
  notice?: ReactNode;
  /** Mounted beside the form: live regions and the like the source needs in the tree. */
  extras?: ReactNode;
}
