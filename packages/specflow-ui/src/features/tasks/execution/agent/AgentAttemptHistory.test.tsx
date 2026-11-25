// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
import {
  finishedAttemptHistory,
  specificationAttemptsHistory,
  takenOverAttemptHistory,
} from './agentAttempt.stories-support';

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
  it('says how a taken-over attempt ended and what it kept, by group, collapsed', () => {
    const openDocument = vi.fn(() => true);
    renderAttempt(takenOverAttemptHistory(), 'implement', 2, { openDocument });

    expect(screen.getByText(/^Taken over by /)).toBeTruthy();
    expect(screen.getByText(/The agent stopped without a result at/)).toBeTruthy();
    expect(screen.getByText('Kept in the checkout, not committed')).toBeTruthy();
    // Empty groups have no row: no Tasks.
    expect(screen.queryByRole('button', { name: /tasks?$/ })).toBeNull();
    // One row of changed files, collapsed: its registered documents first, then the other files.
    const files = screen.getByRole('button', { name: '5 changed files' });
    expect(files.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(files);
    fireEvent.click(screen.getByRole('button', { name: 'task.md' }));
    expect(openDocument).toHaveBeenCalledWith('specs/active/single-sign-on/tasks/t-04/task.md');
    // A document by name and its folder relative to the Specification, never the full path.
    expect(screen.getAllByText('tasks/t-04').length).toBe(2);
    expect(screen.getByText('refresh.ts')).toBeTruthy();
    expect(screen.queryByText(/specs\/active\/single-sign-on\//)).toBeNull();
    // Nothing was committed: no commit note.
    expect(document.querySelector('[data-now-attempt-commit]')).toBeNull();
    expect(document.querySelector('[data-attempt-committed]')).toBeNull();
  });

  it('shows what was achieved, not the lifecycle events or SpecFlow records', () => {
    renderAttempt(takenOverAttemptHistory());

    expect(screen.queryByText('The agent stopped')).toBeNull();
    expect(screen.queryByText('The agent started working')).toBeNull();
    expect(screen.queryByText(/t-04\.yaml/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Technical details|what happened/ })).toBeNull();
  });

  it('says a result the Engine did not accept, the one exception of the lifecycle', () => {
    const history = takenOverAttemptHistory();
    const agent = history.items[1]!.agent!;
    (agent as { events: unknown[] }).events = [
      ...agent.events,
      { kind: 'proposal-refused', at: '2026-11-13T12:09:00Z', code: 'WORKFLOW_GATE_UNMET' },
    ];
    renderAttempt(history);

    expect(document.querySelector('[data-agent-exceptions]')?.textContent).toMatch(
      /^Result not accepted · /,
    );
  });

  it("keeps the owner's note for the agent of a Continue, and nothing for a Turn without one", () => {
    const history = takenOverAttemptHistory();
    const agent = history.items[1]!.agent!;
    (agent as { events: unknown[] }).events = [
      ...agent.events,
      { kind: 'turn-started', at: '2026-11-13T12:10:00Z', turn: 2 },
      {
        kind: 'turn-started',
        at: '2026-11-13T12:20:00Z',
        turn: 3,
        note: 'Run the tests one file at a time.',
      },
    ];
    renderAttempt(history);

    const notes = document.querySelectorAll('[data-agent-owner-notes] li');
    expect(notes).toHaveLength(1);
    expect(notes[0]!.textContent).toMatch(
      /^Your note for the agent: Run the tests one file at a time\. · /,
    );
  });

  it('names a committed attempt in one row with its short commit id', () => {
    renderAttempt(finishedAttemptHistory({ state: 'committed', sha: '05f9d80' + '0'.repeat(33) }));

    expect(document.querySelector('[data-attempt-committed]')?.textContent).toBe(
      'Committed · 05f9d80',
    );
    // Who worked on it, by presentation names, with Open session on the same line.
    expect(document.querySelector('[data-attempt-actor]')?.textContent).toBe('ClaudeOpen session');
    expect(screen.getByRole('link', { name: 'Open session' })).toBeTruthy();
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

    const withAgent = render2(specificationAttemptsHistory() as never);
    expect(await screen.findByRole('heading', { name: 'Agent attempts' })).toBeTruthy();
    // One entry per agent attempt, titled by its step, with how it ended in the shared vocabulary.
    expect(
      Array.from(document.querySelectorAll('[data-attempt-outcome]')).map((n) => n.textContent),
    ).toEqual([
      'Waiting for your confirmation',
      'Changes requested',
      'Completed',
      expect.stringMatching(/^Taken over by /),
      'Finished, but not committed',
      'Returned to Requirements',
    ]);
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Yesterday')).toBeTruthy();
    // The Tasks by title, the first four, then the rest on request.
    fireEvent.click(screen.getByRole('button', { name: '12 tasks' }));
    expect(screen.getByText('End-to-end acceptance and roadmap coverage')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '8 more tasks' }));
    expect(screen.getByText('Transcript brief part')).toBeTruthy();
    // The feedback only on View feedback.
    expect(screen.queryByText(/Install and init stay separate Tasks/)).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'View feedback' })[0]!);
    expect(screen.getByText(/Install and init stay separate Tasks/)).toBeTruthy();
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
