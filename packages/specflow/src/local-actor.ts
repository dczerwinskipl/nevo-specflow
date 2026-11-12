import { userInfo } from 'node:os';

import type { OwnerActor } from '@nevo/specflow-engine';

/**
 * The actor of every offline owner command (D15): the local OS user, `trust: local`. It is built here
 * and nowhere else, and never from an option: no command accepts an actor, an executor class or a
 * trust level from its arguments.
 *
 * `trust: local` is not proof of a human. A local agent runs under the same OS identity and can run
 * the same command, so the CLI cannot tell it from the owner (see the CLI reference).
 */
export function localOwner(osUser: string = userInfo().username): OwnerActor {
  return { class: 'human', details: { actorId: `local:${osUser}`, trust: 'local' } };
}
