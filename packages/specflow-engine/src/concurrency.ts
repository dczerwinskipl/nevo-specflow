/** Default cap for concurrent read-only Git child processes within one request. */
export const READ_GIT_CONCURRENCY = 4;

/**
 * Order-preserving bounded `map` for independent read-only work. Every started
 * item runs to completion; if any item failed, the error of the LOWEST input
 * index is thrown, which matches what a sequential loop would have reported.
 */
export async function mapBounded<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('Concurrency limit must be a positive integer.');
  }
  const results = new Array<R>(items.length);
  const failures: { index: number; error: unknown }[] = [];
  let next = 0;
  const runner = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = await work(items[index] as T, index);
      } catch (error) {
        failures.push({ index, error });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  const first = failures.sort((a, b) => a.index - b.index)[0];
  if (first) throw first.error;
  return results;
}
