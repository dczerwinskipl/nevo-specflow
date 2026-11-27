// @vitest-environment jsdom
import { InformationList } from '@nevo/ui';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StoryLocalization } from '../../../../i18n/StoryLocalization';
import {
  createArchiveItem,
  createSpecItem,
  startReviewAttention,
  waitingForTasks,
  workflowFixtures,
} from '../../../../../test-support/specs/overview/fixtures';
import { stubLayoutApis } from '../../../../../test-support/app/stubLayoutApis';
import { archiveRow, currentRow } from '../presentation';
import { SpecListRow, type SpecListRowProps } from './SpecListRow';

beforeEach(stubLayoutApis);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const title = 'Deterministic admission and execution boundaries';

function renderRow(props: Partial<SpecListRowProps> = {}) {
  return render(
    <StoryLocalization locale="en">
      <InformationList>
        <SpecListRow item={currentRow(createSpecItem())} {...props} />
      </InformationList>
    </StoryLocalization>,
  );
}

describe('SpecListRow primary target', () => {
  it('is plain text when nothing can open the specification (read-only preview)', () => {
    renderRow();
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button', { name: `Open specification: ${title}` })).toBeNull();
  });

  it('is a real link and hands a plain click to the host without leaving the page', () => {
    const onOpenTarget = vi.fn();
    renderRow({ specificationHref: '/specs/admission', onOpenTarget });
    const link = screen.getByRole('link', { name: `Open specification: ${title}` });
    expect(link.getAttribute('href')).toBe('/specs/admission');
    expect(fireEvent.click(link)).toBe(false);
    expect(onOpenTarget).toHaveBeenCalledWith({ kind: 'specification', specId: 'admission' });
  });

  it.each([
    ['ctrl', { ctrlKey: true }],
    ['meta', { metaKey: true }],
    ['shift', { shiftKey: true }],
    ['middle button', { button: 1 }],
  ])('leaves a %s click to the browser (new tab, new window)', (_name, init) => {
    const onOpenTarget = vi.fn();
    renderRow({ specificationHref: '/specs/admission', onOpenTarget });
    const link = screen.getByRole('link', { name: `Open specification: ${title}` });
    // The host handler must not cancel the browser's own navigation; jsdom cannot navigate, so
    // the document listener records the state and cancels it.
    const cancelled: boolean[] = [];
    document.addEventListener(
      'click',
      (event) => {
        cancelled.push(event.defaultPrevented);
        event.preventDefault();
      },
      { once: true },
    );
    fireEvent.click(link, init);
    expect(cancelled).toEqual([false]);
    expect(onOpenTarget).not.toHaveBeenCalled();
  });

  it('is a button when only a callback is given', () => {
    const onOpenTarget = vi.fn();
    renderRow({ onOpenTarget });
    fireEvent.click(screen.getByRole('button', { name: `Open specification: ${title}` }));
    expect(onOpenTarget).toHaveBeenCalledWith({ kind: 'specification', specId: 'admission' });
  });

  it('prefers the link the host renders (router link)', () => {
    renderRow({
      specificationHref: '/ignored',
      renderSpecificationLink: (specId, children, ariaLabel) => (
        <a href={`/routed/${specId}`} aria-label={ariaLabel}>
          {children}
        </a>
      ),
    });
    expect(
      screen.getByRole('link', { name: `Open specification: ${title}` }).getAttribute('href'),
    ).toBe('/routed/admission');
  });
});

describe('SpecListRow pull requests', () => {
  const archived = (overrides: Parameters<typeof createArchiveItem>[0]) =>
    renderRow({ item: archiveRow(createArchiveItem(overrides)) });

  it('links a single pull request with a descriptive name', () => {
    archived({
      title: 'Archived',
      pullRequests: [{ number: 18, url: 'https://example.test/pull/18' }],
    });
    const link = screen.getByRole('link', { name: /18/ });
    expect(link.getAttribute('href')).toBe('https://example.test/pull/18');
    expect(link.textContent).toBe('PR #18');
  });

  it('shows only a count for several pull requests', () => {
    archived({
      pullRequests: [
        { number: 1, url: 'https://example.test/pull/1' },
        { number: 2, url: 'https://example.test/pull/2' },
      ],
    });
    expect(screen.getByText('2 PRs')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /PR #/ })).toBeNull();
  });

  it('shows nothing when there is none', () => {
    archived({ pullRequests: [] });
    expect(screen.queryByText(/PR/)).toBeNull();
  });
});

describe('SpecListRow situation', () => {
  const situation = (item: Parameters<typeof createSpecItem>[0]) => {
    renderRow({ item: currentRow(createSpecItem(item)) });

    // One line per part: a signal that is not the workflow's, the title, the track's line.
    return [
      ...document.querySelectorAll(
        '[data-spec-reason] > span:not([data-step-progress]), [data-step-progress-title], [data-step-progress-detail]',
      ),
    ]
      .map((part) => part.textContent)
      .join(' | ');
  };

  const progress = () => document.querySelector('[data-spec-progress]')?.textContent ?? '';

  it('names the step the workflow waits on and the Tasks the owner can start', () => {
    expect(
      situation({ workflow: waitingForTasks(), classification: { section: 'in-progress' } }),
    ).toBe('Waiting for Tasks | Step 6 of 7 · 5 ready to start');
    // The Overview's segmented step track, named for assistive technology.
    expect(screen.getByRole('img', { name: 'Step 6 of 7: Waiting for Tasks' })).toBeTruthy();
  });

  it('says a workflow that has not started is not started, never "In preparation"', () => {
    expect(
      situation({
        workflow: workflowFixtures.notStarted,
        classification: { section: 'not-started' },
      }),
    ).toBe('Not started | First step · Gather requirements');
  });

  it('says who works on the step and what a review handed back, as the Now does', () => {
    expect(
      situation({
        workflow: workflowFixtures.agentWorking,
        classification: { section: 'in-progress' },
      }),
    ).toMatch(/^Break the solution down \| Step 4 of 7 · Attempt 1 · agent working since /);
    cleanup();
    expect(
      situation({
        workflow: workflowFixtures.changesRequested,
        classification: { section: 'in-progress' },
      }),
    ).toBe('Break the solution down | Step 4 of 7 · Changes requested');
  });

  it('leads a row that requires attention with what to do, then how many more', () => {
    expect(
      situation({
        workflow: workflowFixtures.readyForNextStep,
        classification: { section: 'requires-attention', count: 2 },
        attention: startReviewAttention,
      }),
    ).toBe('Start Review the breakdown | Step 5 of 7 · 1 more item requires attention');
  });

  it('keeps the step under an attention signal that is not the workflow’s', () => {
    expect(
      situation({
        workflow: workflowFixtures.readyForNextStep,
        classification: { section: 'requires-attention', count: 1 },
      }),
    ).toBe('1 item requires attention | Review the breakdown | Step 5 of 7 · Ready to start');
  });

  it('tells a completed run, with its Tasks done, from an abandoned one, with its date', () => {
    expect(
      situation({
        workflow: workflowFixtures.completed,
        classification: { section: 'ended' },
        progress: { completed: 12, total: 12 },
      }),
    ).toBe('Completed');
    expect(progress()).toBe('12 of 12 tasks done');
    cleanup();
    expect(
      situation({ workflow: workflowFixtures.abandoned, classification: { section: 'ended' } }),
    ).toMatch(/^Abandoned \| \S/);
    expect(
      document.querySelector('[data-step-progress-detail] time')?.getAttribute('dateTime'),
    ).toBe('2026-11-20T15:40:00Z');
    expect(document.querySelector('[data-step-progress-track]')).toBeNull();
    // No Task progress for an abandoned run.
    expect(progress()).toBe('');
  });

  it('says a Specification could not be read, and why', () => {
    expect(
      situation({
        workflow: null,
        classification: { section: 'unknown' },
        unreadable: { reason: 'filesystem' },
      }),
    ).toBe('Could not read this Specification | Its workflow files could not be read.');
  });

  it('names the recovery command when the project lock needs a recovery', () => {
    expect(
      situation({
        workflow: null,
        classification: { section: 'unknown' },
        unreadable: { reason: 'recovery' },
      }),
    ).toContain('nevo-specflow specs documents recover --confirmed-stopped');
  });

  it('marks a busy workflow read as a transient "state unavailable · busy", not a broken one', () => {
    expect(
      situation({
        workflow: null,
        classification: { section: 'unknown' },
        unreadable: { reason: 'busy' },
      }),
    ).toBe(
      'State unavailable · busy | SpecFlow is busy or recovering from a stop. Refresh the list in a moment. If it keeps happening, restart SpecFlow.',
    );
    expect(document.querySelector('[data-spec-unreadable="busy"]')).not.toBeNull();
  });
});
