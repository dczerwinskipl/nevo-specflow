import type { SpecsOverviewSource } from './model';

// Until the Runtime owns a steering projection, callers inject a source at the app boundary.
// Missing capability must never look like an empty project or fabricated live work.
export const unavailableSpecsSource: SpecsOverviewSource = {
  read: () => Promise.reject(new Error('Specs overview projection is not configured.')),
};

export function defaultSpecsSource(): SpecsOverviewSource {
  if (import.meta.env.DEV && import.meta.env.VITE_SPECFLOW_SAMPLE_DATA === 'true') {
    return {
      sample: true,
      read: async (collection, signal) => {
        const { createSpecsFixture } = await import('./fixtures');
        signal.throwIfAborted();
        return createSpecsFixture(collection);
      },
    };
  }
  return unavailableSpecsSource;
}
