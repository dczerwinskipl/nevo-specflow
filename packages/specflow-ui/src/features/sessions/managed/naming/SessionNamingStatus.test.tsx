// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../i18n';
import { SessionNamingStatus } from './SessionNamingStatus';

afterEach(cleanup);

describe('SessionNamingStatus', () => {
  it('announces politely that the agent is naming the Session', () => {
    render(
      <LocalizationProvider instance={createSpecFlowI18n('en')}>
        <SessionNamingStatus />
      </LocalizationProvider>,
    );
    expect(screen.getByRole('status').textContent).toBe('Naming…');
  });
});
