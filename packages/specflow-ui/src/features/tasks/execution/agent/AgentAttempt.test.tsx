// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpecFlowQueryClient } from '../../../../app/queryClient';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../i18n';
import { createSpecFlowAppServices } from '../../../../services';
import { TestServicesRouterContext } from '../../../../../test-support/app/TestServicesRouterContext';
import { stubLayoutApis } from '../../../../../test-support/app/stubLayoutApis';
import { fakeTaskAuthoringApi } from '../../authoring/authoring.test-support';
import type { WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import type { WorkflowExecutionApi } from '../api';
import { SPEC, TASK, taskWorkflowProjection } from '../projections.stories-support';
import { refusal } from '../ProjectWorkflowExecution.stories-support';
import { WorkflowNow } from '../WorkflowNow';
import { needsPolling } from './agentAttempt';
import { POLL_MS, usePolling } from './usePolling';
import {
  ATTEMPT_ID,
  agentAttemptProjection,
  finishedAttemptHistory,
  finishedAttemptProjection,
  type AttemptCase,
} from './agentAttempt.stories-support';
import { SESSION_ID, agentOptions } from './agentStart.stories-support';

afterEach(cleanup);

const never = () => new Promise<never>(() => undefined);
const settled = { postActions: [] };

function renderNow(
  attempt: AttemptCase,
  api: Partial<WorkflowExecutionApi> = {},
  options: {
    readonly reconcile?: ReturnType<typeof vi.fn>;
    readonly projection?: WorkflowActionProjection;
  } = {},
) {
  stubLayoutApis();
  const defaults = createSpecFlowAppServices();
  const services = createSpecFlowAppServices({
    taskAuthoringApi: fakeTaskAuthoringApi(),
    managedSessionsApi: {
      ...defaults.managedSessionsApi,
      reconcile: (options.reconcile ?? vi.fn(never)) as never,
    },
    workflowExecutionApi: {
      start: vi.fn(never),
      finish: vi.fn(never),
      returnTo: vi.fn(never),
      reevaluateWait: vi.fn(never),
      abandon: vi.fn(never),
      checkAgentExecution: vi.fn(never),
      startAgentExecution: vi.fn(never),
      stopAgentExecution: vi.fn(never),
      retryAttemptCommit: vi.fn(never),
      confirmResult: vi.fn(never),
      takeOverAgentExecution: vi.fn(never),
      history: vi.fn(never),
      rejectResult: vi.fn(never),
      closePreview: vi.fn(never),
      closeOccupancy: vi.fn(never),
      close: vi.fn(never),
      ...api,
    },
  });
  const projection = options.projection ?? agentAttemptProjection(attempt);
  const subject = attempt === 'confirmation' ? { specId: SPEC } : { specId: SPEC, taskId: TASK };

  return render(
    <QueryClientProvider client={createSpecFlowQueryClient()}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <WorkflowNow
            subject={subject}
            projection={projection}
            headingId="now"
            links={{}}
            artifactOptions={[]}
          />
        </LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>,
  );
}

/** The action row's buttons (the ⋯ menu is not part of it). */
function actions(container: HTMLElement) {
  const row = container.querySelector('[data-slot="workflow-actions"]');

  return Array.from(row?.querySelectorAll('button') ?? []).map((button) => button.textContent);
}

describe('an agent working on a step', () => {
  it('stops the agent of the attempt the owner was shown', async () => {
    const stop = vi.fn(never);
    const { container } = renderNow('working', { stopAgentExecution: stop });

    expect(screen.getByText(/agent working since/)).toBeTruthy();
    expect(actions(container)).toEqual(['Stop agent']);
    fireEvent.click(screen.getByRole('button', { name: 'Stop agent' }));

    await waitFor(() =>
      expect(stop).toHaveBeenCalledWith(
        { specId: SPEC, taskId: TASK },
        { requestId: expect.any(String) as string, attemptId: ATTEMPT_ID },
      ),
    );
  });

  it('says it is stopping, and never says stopped, until the process is proven ended', () => {
    const { container } = renderNow('stopping');

    expect(screen.getByText(/stopping the agent/)).toBeTruthy();
    expect(actions(container)).toEqual(['Stopping…']);
    expect(screen.getByRole('button', { name: 'Stopping…' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByText(/stopped without/)).toBeNull();
  });

  it('asks the Session again for an outcome that is unknown', async () => {
    const reconcile = vi.fn(never);
    renderNow('unknown', {}, { reconcile });

    expect(screen.getByRole('alert').textContent).toContain('cannot tell whether the agent');
    fireEvent.click(screen.getByRole('button', { name: 'Check outcome' }));

    await waitFor(() =>
      expect(reconcile).toHaveBeenCalledWith(SESSION_ID, 'turn-1', expect.any(String) as string),
    );
  });
});

describe('an agent that stopped', () => {
  it('continues the same attempt, choosing no agent (the Session keeps its own)', async () => {
    const start = vi.fn(never);
    const { container } = renderNow('stopped', { startAgentExecution: start });

    expect(screen.getByText('The agent stopped without proposing a result.')).toBeTruthy();
    expect(actions(container)).toEqual(['Continue', 'Take over']);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(start).toHaveBeenCalledWith(
        { specId: SPEC, taskId: TASK },
        { requestId: expect.any(String) as string, expected: { step: 'implement', attempt: 2 } },
      ),
    );
  });

  it('starts a Session that was never created with Retry start', async () => {
    const start = vi.fn(never);
    renderNow('session-missing', { startAgentExecution: start });

    fireEvent.click(screen.getByRole('button', { name: 'Retry start' }));

    await waitFor(() => expect(start).toHaveBeenCalledOnce());
  });

  it('lists why the result was not accepted, one reason per line', () => {
    renderNow('refused');

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(
      'proposed Ready for review, and SpecFlow did not accept it',
    );
    expect(within(alert).getByText('specs/active/single-sign-on/notes.md')).toBeTruthy();
    expect(alert.textContent).toContain('Give it a type or delete it');
  });

  it('shows before the click that Continue is refused, and why', () => {
    const start = vi.fn(never);
    renderNow('continue-refused', { startAgentExecution: start });

    expect(screen.getByRole('alert').textContent).toContain(
      'The agent cannot continue: 2 files changed since it stopped.',
    );
    expect(screen.getByText('docs/notes.md')).toBeTruthy();
    // One explanation: the refusal replaces "stopped without proposing a result"; Check again is inside it.
    expect(screen.queryByText('The agent stopped without proposing a result.')).toBeNull();
    expect(
      within(screen.getByRole('alert')).getByRole('button', { name: 'Check again' }),
    ).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.click(button);
    expect(start).not.toHaveBeenCalled();
  });

  it('says the Session is gone when it is', () => {
    renderNow('session-gone');

    expect(screen.getByRole('alert').textContent).toContain('its session no longer exists');
    // A Session that is gone is never a link: struck through, in the position line too.
    expect(screen.queryByRole('link')).toBeNull();
    expect(document.querySelector('.line-through')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' }).hasAttribute('disabled')).toBe(true);
  });
});

describe('a result that waits for the owner', () => {
  it('shows the proposal and what Confirm applies, and confirms exactly what was shown', async () => {
    const confirmResult = vi.fn(() => Promise.resolve(settled as never));
    const { container } = renderNow('confirmation', { confirmResult });

    expect(screen.getByText(/Waiting for your confirmation/)).toBeTruthy();
    expect(screen.getByText(/Five tasks cover the token exchange/)).toBeTruthy();
    expect(screen.getByText(/Confirming approves the 5 draft tasks \(t-01 to t-05\)/)).toBeTruthy();
    expect(actions(container)).toEqual(['Confirm', 'Reject']);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(confirmResult).toHaveBeenCalledWith(
        { specId: SPEC },
        {
          requestId: expect.any(String) as string,
          step: 'breakdown',
          attempt: 1,
          confirmsDigest: 'a'.repeat(64),
        },
      ),
    );
  });

  it('says what Confirm would apply changed, and offers it again after reading', async () => {
    const confirmResult = vi.fn(() => Promise.reject(refusal('WORKFLOW_CONFIRMATION_CHANGED')));
    renderNow('confirmation', { confirmResult });

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect((await screen.findByRole('alert')).textContent).toContain('changed since you opened');
    expect(screen.getByRole('button', { name: 'Confirm' }).hasAttribute('disabled')).toBe(false);
  });

  it('rejects only with the owner’s feedback', async () => {
    const rejectResult = vi.fn(() => Promise.resolve(settled as never));
    renderNow('confirmation', { rejectResult });

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Reject' });
    expect(submit.hasAttribute('disabled')).toBe(true);

    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: ' Split t-05. ' } });
    expect(submit.hasAttribute('disabled')).toBe(false);
    fireEvent.click(submit);

    await waitFor(() =>
      expect(rejectResult).toHaveBeenCalledWith(
        { specId: SPEC },
        {
          requestId: expect.any(String) as string,
          step: 'breakdown',
          attempt: 1,
          feedback: 'Split t-05.',
        },
      ),
    );
  });
});

describe('the commit of a finished attempt', () => {
  const history = (commit: { state: 'committed' | 'failed' | 'pending'; code?: string }) =>
    vi.fn(() => Promise.resolve(finishedAttemptHistory(commit) as never));

  it('keeps Retry commit inside the note, and says the next agent step waits for it', async () => {
    const retry = vi.fn(never);
    renderNow(
      'working',
      { retryAttemptCommit: retry, history: history({ state: 'failed', code: 'COMMIT_BLOCKED' }) },
      { projection: finishedAttemptProjection() },
    );

    const note = await screen.findByRole('alert');
    expect(note.textContent).toContain('Implementation is finished, but its commit failed');
    expect(note.textContent).toContain('COMMIT_BLOCKED');
    expect(note.textContent).toContain('Run with agent cannot start Review');
    expect(within(note).getByText('src/auth/state.ts')).toBeTruthy();
    fireEvent.click(within(note).getByRole('button', { name: 'Retry commit' }));

    await waitFor(() =>
      expect(retry).toHaveBeenCalledWith(
        { specId: SPEC, taskId: TASK },
        { step: 'implement', attempt: 2 },
      ),
    );
  });

  it('says the work is committed', async () => {
    renderNow(
      'working',
      { history: history({ state: 'committed' }) },
      { projection: finishedAttemptProjection() },
    );

    expect(await screen.findByText(/Its work is committed/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry commit' })).toBeNull();
  });

  it('reads nothing when a person finished the step before', () => {
    const read = history({ state: 'committed' });
    renderNow(
      'working',
      { history: read },
      { projection: taskWorkflowProjection('ready-agent', { agent: agentOptions.independent }) },
    );

    expect(read).not.toHaveBeenCalled();
  });

  it('reads the history again while the commit is still pending, and stops once it settles', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let state: 'pending' | 'committed' = 'pending';
      const read = vi.fn(() => Promise.resolve(finishedAttemptHistory({ state }) as never));
      renderNow('working', { history: read }, { projection: finishedAttemptProjection() });
      await waitFor(() => expect(read).toHaveBeenCalledTimes(1));

      await vi.advanceTimersByTimeAsync(POLL_MS + 100);
      await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(1));

      state = 'committed';
      await vi.advanceTimersByTimeAsync(POLL_MS + 100);
      expect(await screen.findByText(/Its work is committed/)).toBeTruthy();
      const settled = read.mock.calls.length;
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
      expect(read.mock.calls.length).toBe(settled);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('polling the attempt', () => {
  it('turns on while the agent works, is stopping, may still run, a return waits or a proposal is applied', () => {
    for (const c of ['working', 'stopping', 'unknown', 'return-requested', 'return-stop-failed']) {
      expect(needsPolling(agentAttemptProjection(c as AttemptCase))).toBe(true);
    }
  });

  it('is off once the owner decides: stopped, refused, refused Continue, confirmation, no attempt', () => {
    for (const c of ['stopped', 'refused', 'continue-refused', 'session-gone', 'confirmation']) {
      expect(needsPolling(agentAttemptProjection(c as AttemptCase))).toBe(false);
    }

    expect(needsPolling({})).toBe(false);
  });

  it('ticks only while active, and stops when the state no longer needs it', () => {
    vi.useFakeTimers();
    try {
      const tick = vi.fn();
      const { rerender } = renderHook(({ active }) => usePolling(active, tick), {
        initialProps: { active: true },
      });
      vi.advanceTimersByTime(POLL_MS * 2 + 1);
      expect(tick).toHaveBeenCalledTimes(2);

      rerender({ active: false });
      vi.advanceTimersByTime(POLL_MS * 3);
      expect(tick).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a return that waits for the agent to stop', () => {
  it('says the step goes back only once the process has ended, and offers no action', () => {
    const { container } = renderNow('return-requested');

    expect(screen.getByText(/return requested · waiting for the agent to stop/)).toBeTruthy();
    expect(screen.getByText(/only once its process has ended/)).toBeTruthy();
    expect(actions(container)).toEqual(['Returning…']);
  });

  it('offers Stop again when the agent could not be stopped', async () => {
    const stop = vi.fn(never);
    const { container } = renderNow('return-stop-failed', { stopAgentExecution: stop });

    expect(screen.getByRole('alert').textContent).toContain('could not stop the agent');
    expect(actions(container)).toEqual(['Stop again']);
    fireEvent.click(screen.getByRole('button', { name: 'Stop again' }));

    await waitFor(() => expect(stop).toHaveBeenCalledOnce());
  });

  it('keeps Return in the menu once the agent stopped, and offers no dead button', () => {
    const { container } = renderNow('return-next-action');

    expect(screen.getByText(/the agent has stopped/)).toBeTruthy();
    expect(screen.getByText(/choose Return in the menu/)).toBeTruthy();
    expect(actions(container)).toEqual([]);
    expect(screen.getByRole('button', { name: 'Workflow operations' })).toBeTruthy();
  });
});

describe('taking over an agent that stopped', () => {
  it('shows what the agent kept, and Continue with Take over beside it', () => {
    const { container } = renderNow('stopped');

    expect(document.body.textContent).toContain(
      'Kept so far: task.md, screens.md and 3 changed files',
    );
    expect(screen.getByText(/Take over to finish the step yourself/)).toBeTruthy();
    expect(actions(container)).toEqual(['Continue', 'Take over']);
  });

  it('is not offered while the agent works or its outcome is unknown', () => {
    const { container } = renderNow('unknown');

    expect(actions(container)).toEqual(['Check outcome']);
  });

  it('says the agent’s files stay uncommitted, then takes over the attempt it was shown', async () => {
    const takeOver = vi.fn(never);
    renderNow('stopped', { takeOverAgentExecution: takeOver });

    fireEvent.click(screen.getByRole('button', { name: 'Take over' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Take over Implementation')).toBeTruthy();
    expect(within(dialog).getByText(/your own attempt 3 starts/)).toBeTruthy();
    expect(within(dialog).getByText(/finishing the step does not commit them/)).toBeTruthy();
    expect(within(dialog).getByText('src/auth/refresh.ts')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Take over' }));

    await waitFor(() =>
      expect(takeOver).toHaveBeenCalledWith(
        { specId: SPEC, taskId: TASK },
        { step: 'implement', attempt: 2 },
      ),
    );
  });
});
