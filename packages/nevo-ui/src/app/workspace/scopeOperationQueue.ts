/**
 * Serialises a workspace scope's navigation operations and ends them with the scope.
 *
 * Each scope generation gets its own chain, so an operation of an old scope that is still waiting
 * never blocks the new one. Generations only grow: an operation of a generation older than the
 * current chain is refused outright.
 *
 * Ending a generation (`endBefore` on a scope change, `endAll` when the provider unmounts) settles
 * every operation of it `false` at once, even one still awaiting a leave guard that will never
 * answer (its dialog went away with the old screen). The operation's own body may still resume
 * later, when that guard finally answers; it must re-check that its scope is current after every
 * await and do nothing otherwise — its caller has already been told `false`.
 */
export interface ScopeOperationQueue {
  run(generation: number, operation: () => Promise<boolean>): Promise<boolean>;
  /** Ends every generation older than `generation`. */
  endBefore(generation: number): void;
  /** Ends every generation with operations in flight (the provider unmounts). */
  endAll(): void;
}

export function createScopeOperationQueue(initialGeneration: number): ScopeOperationQueue {
  let pending: { generation: number; chain: Promise<unknown> } = {
    generation: initialGeneration,
    chain: Promise.resolve(),
  };
  /** Highest generation already ended by a scope change; none of its operations may start. */
  let endedThrough = initialGeneration - 1;
  /** One "this generation ended" signal per generation that has operations in flight. */
  const endSignals = new Map<number, { settled: Promise<false>; end: () => void }>();

  const endSignal = (generation: number) => {
    let signal = endSignals.get(generation);
    if (!signal) {
      let end!: () => void;
      const settled = new Promise<false>((resolve) => {
        end = () => resolve(false);
      });
      signal = { settled, end };
      endSignals.set(generation, signal);
    }

    return signal.settled;
  };

  const end = (shouldEnd: (generation: number) => boolean) => {
    for (const [generation, signal] of endSignals) {
      if (shouldEnd(generation)) {
        signal.end();
        endSignals.delete(generation);
      }
    }
  };

  return {
    run(generation, operation) {
      if (generation <= endedThrough || generation < pending.generation) {
        return Promise.resolve(false);
      }

      const head = generation === pending.generation ? pending.chain : Promise.resolve();
      const result = head.then(operation, operation);
      pending = {
        generation,
        chain: result.then(
          () => undefined,
          () => undefined,
        ),
      };

      return Promise.race([result, endSignal(generation)]);
    },
    endBefore(generation) {
      endedThrough = Math.max(endedThrough, generation - 1);
      end((candidate) => candidate < generation);
    },
    endAll() {
      end(() => true);
    },
  };
}
