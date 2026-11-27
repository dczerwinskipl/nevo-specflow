import type { CreatedSpec } from '@nevo/specflow-contracts/specs';
import { isApiError } from '../../../../api';
import type { CreateFailure } from '../errors/createFailure';
import { toCreateFailure, toOperationFailure, type SentCreate } from '../errors/createSpecErrors';
import type { CreateWatchResult } from './watchCreateOperation';

/** What the hook does with one ended submit or watch. Pure: the hook only carries it out. */
export type InterpretedResult =
  | { kind: 'completed'; created: CreatedSpec }
  | {
      kind: 'failed';
      failure: CreateFailure;
      /**
       * The stored (resumable) operation is released: the server declared the request refused, so a
       * reload must not resume it. An unknown outcome keeps it.
       */
      releaseStorage: boolean;
      /** The retained request is dropped: replaying it could never succeed (a new id is needed). */
      discardAttempt: boolean;
      /** Polite announcement that belongs to this outcome. */
      announce?: 'notStarted' | 'operationFailed';
    };

/** Failures that settle the operation as refused; anything else leaves the outcome open. */
const isDefinite = (failure: CreateFailure) =>
  failure.kind !== 'uncertain' && failure.kind !== 'recovery-required';

/**
 * Decides what became of a Create from how its submit or watch ended.
 *
 * `sent` says what the request carried: whether a taken or protected branch was typed or generated
 * decides the remedy.
 */
export function interpretWatchResult(
  result: CreateWatchResult,
  sent: SentCreate = {},
): InterpretedResult {
  switch (result.kind) {
    case 'completed':
      return { kind: 'completed', created: result.created };
    case 'recovery-required': {
      // A cause the page can name (Git of the stopped Create, an unjudgeable project lock).
      const named = result.code === undefined ? undefined : toOperationFailure(result.code);

      return open(named?.kind === 'recovery-required' ? named : { kind: 'recovery-required' });
    }

    case 'not-started':
      // The Runtime has no record of an operation it accepted or this browser kept: it was lost
      // (SpecFlow stopped before starting it). Sending the same request again is the way on.
      return open({ kind: 'uncertain', cause: 'lost' });
    case 'unresolved': {
      // A journal that needs recovery and a lost session or capability are told apart; every other
      // unknown stays "check it".
      const failure = isApiError(result.error) ? toCreateFailure(result.error) : undefined;

      return open(
        failure?.kind === 'unauthenticated' ||
          failure?.kind === 'forbidden' ||
          failure?.kind === 'recovery-required' ||
          failure?.kind === 'uncertain'
          ? failure
          : { kind: 'uncertain' },
      );
    }

    case 'operation-failed': {
      const failure = toOperationFailure(result.code, sent);
      // Nothing was created, and the same operation may be sent again: it stays retained (Try again).
      if (failure.kind === 'interrupted') {
        return {
          kind: 'failed',
          failure,
          releaseStorage: false,
          discardAttempt: false,
          announce: 'operationFailed',
        };
      }

      return isDefinite(failure) ? refused(failure, 'operationFailed') : open(failure);
    }

    case 'failed':
      return refused(
        isApiError(result.error) ? toCreateFailure(result.error, sent) : { kind: 'failed' },
      );
  }
}

/** The outcome stays open: the stored operation and the retained request are kept. */
function open(
  failure: CreateFailure,
  announce?: 'notStarted' | 'operationFailed',
): InterpretedResult {
  return {
    kind: 'failed',
    failure,
    releaseStorage: false,
    discardAttempt: false,
    ...(announce ? { announce } : {}),
  };
}

function refused(
  failure: CreateFailure,
  announce?: 'notStarted' | 'operationFailed',
): InterpretedResult {
  return {
    kind: 'failed',
    failure,
    releaseStorage: true,
    discardAttempt:
      failure.kind === 'operation-conflict' ||
      failure.kind === 'name-conflict' ||
      failure.kind === 'name-invalid',
    ...(announce ? { announce } : {}),
  };
}
