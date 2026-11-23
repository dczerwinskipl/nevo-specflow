// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowHistory } from '@nevo/specflow-contracts/workflow';
import { createSpecFlowQueryClient } from '../../../../app/queryClient';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../i18n';
import { createSpecFlowAppServices } from '../../../../services';
import { TestServicesRouterContext } from '../../../../../test-support/app/TestServicesRouterContext';
import { stubLayoutApis } from '../../../../../test-support/app/stubLayoutApis';
import type { WorkflowExecutionApi } from '../api';
import { AgentAttemptHistory, agentAttemptOf } from './AgentAttemptHistory';
import { SpecificationAgentAttempts } from './SpecificationAgentAttempts';
import { finishedAttemptHistory, takenOverAttemptHistory } from './agentAttempt.stories-support';

afterEach(cleanup);

const never = () => new Promise<never>(() => undefined);

function renderAttempt(
  history: WorkflowHistory,
  step = 'implement',
  attempt = 2,
  options: {
    readonly openDocument?: (path: string) => boolean;
    readonly retryAttemptCommit?: WorkflowExecutionApi['retryAttemptCommit'];
  } = {},
) {
  stubLayoutApis();
  const item = agentAttemptOf(history, step, attempt);
  if (!item) {
    throw new Error('No agent attempt in the fixture');
  }

  const defaults = createSpecFlowAppServices();
  const services = createSpecFlowAppServices({
    workflowExecutionApi: {
      ...defaults.workflowExecutionApi,
      retryAttemptCommit: options.retryAttemptCommit ?? vi.fn(never),
    },
  });

  return render(
    <QueryClientProvider client={createSpecFlowQueryClient()}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <AgentAttemptHistory
            item={item}
            items={history.items}
            subject={{ specId: 'sso', taskId: 't-04' }}
            {...(options.openDocument ? { openDocument: options.openDocument } : {})}
          />
        </LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>,
  );
}

describe('the agent attempt in the history', () => {
  it('says how a taken-over attempt ended and what it kept, with its documents linked', () => {
    const openDocument = vi.fn(() => true);
    renderAttempt(takenOverAttemptHistory(), 'implement', 2, { openDocument });

    expect(screen.getByText(/^Taken over by /)).toBeTruthy();
    expect(screen.getByText(/The agent stopped without a result at/)).toBeTruthy();
    expect(screen.getByText(/Its work, kept and not committed:/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'task.md' }));
    expect(openDocument).toHaveBeenCalledWith('specs/active/single-sign-on/tasks/t-04/task.md');
    expect(screen.getByText('src/auth/refresh.ts')).toBeTruthy();
    expect(screen.getByText(/Tasks:/).textContent).toBe('Tasks: none');
    // Nothing was committed: no commit note.
    expect(document.querySelector('[data-now-attempt-commit]')).toBeNull();
  });

  it('shows the events only on request, in plain words', () => {
    renderAttempt(takenOverAttemptHistory());

    expect(screen.queryByText('The agent stopped')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show what happened' }));

    const events = within(document.querySelector<HTMLElement>('[data-agent-events]')!);
    expect(events.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Started'),
      expect.stringContaining('The agent started working'),
      expect.stringContaining('The agent stopped'),
      expect.stringContaining('Taken over'),
    ]);
    expect(screen.getByRole('button', { name: 'Hide what happened' })).toBeTruthy();
  });

  it('retries a failed commit from the history, as the Now block does', async () => {
    const retry = vi.fn(never);
    renderAttempt(
      finishedAttemptHistory({ state: 'failed', code: 'COMMIT_BLOCKED' }),
      'implement',
      2,
      {
        retryAttemptCommit: retry,
      },
    );

    expect(screen.getByText('COMMIT_BLOCKED')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry commit' }));

    await waitFor(() =>
      expect(retry).toHaveBeenCalledWith(
        { specId: 'sso', taskId: 't-04' },
        { step: 'implement', attempt: 2 },
      ),
    );
  });

  it('lists the agent attempts of a Specification and nothing when it has none', async () => {
    stubLayoutApis();
    const render2 = (history: WorkflowHistory) => {
      const defaults = createSpecFlowAppServices();
      const services = createSpecFlowAppServices({
        workflowExecutionApi: {
          ...defaults.workflowExecutionApi,
          history: () => Promise.resolve(history),
        },
      });

      return render(
        <QueryClientProvider client={createSpecFlowQueryClient()}>
          <TestServicesRouterContext services={services}>
            <LocalizationProvider instance={createSpecFlowI18n('en')}>
              <SpecificationAgentAttempts specId="sso" />
            </LocalizationProvider>
          </TestServicesRouterContext>
        </QueryClientProvider>,
      );
    };

    const withAgent = render2(takenOverAttemptHistory());
    expect(await screen.findByRole('heading', { name: 'Agent attempts' })).toBeTruthy();
    expect(screen.getByText(/^Taken over by /)).toBeTruthy();
    withAgent.unmount();

    const empty = render2({
      subject: { kind: 'specification', specId: 'sso' },
      items: [],
    } as never);
    await waitFor(() => expect(empty.container.textContent).toBe(''));
  });

  it('finds the agent attempt by step and attempt, and no other', () => {
    const history = takenOverAttemptHistory() as never as WorkflowHistory;

    expect(agentAttemptOf(history, 'implement', 2)?.agent.ended).toBe('taken-over');
    expect(agentAttemptOf(history, 'implement', 3)).toBeUndefined();
    expect(agentAttemptOf(undefined, 'implement', 2)).toBeUndefined();
  });
});
