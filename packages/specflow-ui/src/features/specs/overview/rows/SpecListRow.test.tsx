// @vitest-environment jsdom
import { InformationList } from '@nevo/ui';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StoryLocalization } from '../../../../i18n/StoryLocalization';
import {
  createArchiveItem,
  createSpecItem,
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
