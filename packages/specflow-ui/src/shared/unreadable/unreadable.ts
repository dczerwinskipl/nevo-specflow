import { asApiError } from '../../api';
import type { MessageKey } from '../../i18n/message';

/**
 * Why something the Runtime holds could not be read, as the owner is told it. Never "not
 * supported": a read that fails now may work in a moment.
 * - `busy`: the Runtime said so (the project control lock was held: `CONTROL_LOCK_BUSY` or a 503
 *   with `Retry-After`), e.g. while SpecFlow recovers from a stop;
 * - `source`: the Runtime could not read its source (`specification_source_unavailable` without
 *   `Retry-After`, a section's `source_unavailable`): busy, recovering or a file it cannot read;
 * - `unreachable`: no answer from the Runtime (offline, timeout);
 * - `failed`: anything else (an unexpected server error or answer).
 */
export type UnreadableCause = 'busy' | 'source' | 'unreachable' | 'failed';

/** The cause of a failed read, from the classified error of its request. */
export function unreadableCauseOf(error: unknown): UnreadableCause {
  const failure = asApiError(error, { operation: 'read', method: 'GET' });
  if (!failure) {
    return 'failed';
  }

  switch (failure.kind) {
    case 'network':
    case 'timeout':
      return 'unreachable';
    case 'unavailable':
      return failure.code === 'CONTROL_LOCK_BUSY' || failure.retryAfterMs !== undefined
        ? 'busy'
        : 'source';
    default:
      return 'failed';
  }
}

/** The plain-language reason and what to do next, one line each. */
export function unreadableCopy(cause: UnreadableCause): {
  readonly title: MessageKey;
  readonly description: MessageKey;
} {
  return {
    title: `unreadable.${cause}.title` as MessageKey,
    description: `unreadable.${cause}.description` as MessageKey,
  };
}
