// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { CorpusProblemView } from './ReaderStates';

afterEach(cleanup);

describe('missing documentation recovery', () => {
  it.each([
    ['en', 'Refresh', /Nevo documentation metadata/],
    ['pl', 'Odśwież', /metadanymi dokumentacji Nevo/],
  ] as const)(
    'names the configured folder and offers Refresh in %s',
    (locale, refresh, metadata) => {
      const onRetry = vi.fn();
      render(
        <LocalizationProvider instance={createSpecFlowI18n(locale)}>
          <CorpusProblemView
            problem={{ kind: 'not-configured', docsRoot: 'handbook' }}
            workspaceName="First run"
            folder="first-run"
            onRetry={onRetry}
          />
        </LocalizationProvider>,
      );

      expect(screen.getByText('handbook/')).toBeTruthy();
      expect(screen.getByText(metadata)).toBeTruthy();
      expect(screen.getByText('docs.root')).toBeTruthy();
      expect(screen.getByText('.nevo/config.yaml')).toBeTruthy();
      expect(screen.queryByText('docs/')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: refresh }));
      expect(onRetry).toHaveBeenCalledOnce();
    },
  );
});
