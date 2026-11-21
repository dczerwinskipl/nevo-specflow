import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, InlineNote, Typography, cn } from '@nevo/ui';
import { InlineAction } from '../../features/tasks/execution/InlineAction';
import { CopyAction } from '../../features/tasks/execution/specification/CopyAction';
import { StoryLocalization } from '../../i18n/StoryLocalization';

/*
 * PRESENTATION MOCK ONLY. Shared parts of the Ask agent mock: the real routed screen with one region
 * replaced by the mock's version (the Now block, the Task history list), and small presentational
 * pieces copied from the Close dialog's private helpers so the mock reads like the shipped dialog.
 */

/**
 * Renders `children` in place of the first element `find` returns, inside the real screen (so the
 * page's container queries and widths apply), and hides the original. It keeps watching: a screen
 * that renders the region again is replaced again.
 */
export function Replace({
  find,
  children,
  mirrorClass = false,
}: {
  readonly find: () => HTMLElement | null | undefined;
  readonly children: ReactNode;
  /** The replacement takes the original's classes (a text line that keeps its typography). */
  readonly mirrorClass?: boolean;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let created: HTMLElement | null = null;
    const tick = () => {
      const target = find();
      if (!target) {
        return;
      }

      target.style.display = 'none';
      if (!created || !created.isConnected || created.nextElementSibling !== target) {
        created?.remove();
        created = document.createElement('div');
        created.setAttribute('data-mock-replacement', '');
        if (mirrorClass) {
          created.className = target.className;
        }

        target.parentElement?.insertBefore(created, target);
        setHost(created);
      }
    };

    tick();
    const timer = window.setInterval(tick, 150);

    return () => {
      window.clearInterval(timer);
      created?.remove();
    };
  }, [find, mirrorClass]);

  return host ? createPortal(<StoryLocalization>{children}</StoryLocalization>, host) : null;
}

/** The real Now region of the page (never the mock's own). */
export const findNow = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-workflow-now]')).find(
    (element) => !element.closest('[data-mock-replacement]'),
  );

/** The Task history's list in the Secondary (the timeline with "Attempt details"). */
export const findHistoryList = () =>
  Array.from(document.querySelectorAll<HTMLElement>('ol')).find(
    (element) =>
      !element.closest('[data-mock-replacement]') &&
      (element.textContent ?? '').includes('Attempt details'),
  );

/** The deepest element (outside the mock's own) whose text contains every one of `parts`. */
export function findDeepest(...parts: readonly string[]) {
  return () => {
    const matches = Array.from(
      document.querySelectorAll<HTMLElement>('main *, [role=main] *, body *'),
    ).filter(
      (element) =>
        !element.closest('[data-mock-replacement]') &&
        parts.every((part) => (element.textContent ?? '').includes(part)),
    );

    let found = matches.find(
      (element) =>
        !Array.from(element.children).some((child) => matches.includes(child as HTMLElement)),
    );
    // Widen to the outermost wrapper that holds only this text (an empty state's own box).
    while (
      found?.parentElement &&
      (found.parentElement.textContent ?? '').trim() === (found.textContent ?? '').trim()
    ) {
      found = found.parentElement;
    }

    return found;
  };
}

export const MONO = 'font-mono text-content-primary [overflow-wrap:anywhere]';

/** A branch name: monospace and never broken inside (it is short enough to move to its own line). */
export function Branch({ name }: { readonly name: string }) {
  return <span className="font-mono whitespace-nowrap text-content-primary">{name}</span>;
}

/** A heading, its one explanation and its content (the Close dialog's blocker group). */
export function Group({
  heading,
  explanation,
  children,
  level = 3,
}: {
  readonly heading: ReactNode;
  readonly explanation?: ReactNode;
  readonly children?: ReactNode;
  readonly level?: 3 | 4;
}) {
  return (
    <section className="grid min-w-0 gap-2">
      <div className="grid gap-0.5">
        <Typography as={level === 3 ? 'h3' : 'h4'} variant="label-sm">
          {heading}
        </Typography>
        {explanation ? (
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            {explanation}
          </Typography>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Paths as the Close dialog lists them: at most five, then "and N more". */
export function PathList({
  paths,
  count,
  note,
}: {
  readonly paths: readonly string[];
  readonly count?: number;
  /** A muted label after a path ("(this specification)"), by path. */
  readonly note?: (path: string) => string | undefined;
}) {
  const shown = paths.slice(0, 5);
  const more = (count ?? paths.length) - shown.length;

  return (
    <ul className="grid list-disc gap-0.5 pl-5 text-body-sm marker:text-content-muted">
      {shown.map((path) => (
        <li key={path}>
          <span className={MONO}>{path}</span>
          {note?.(path) ? <span className="text-content-muted"> {note(path)}</span> : null}
        </li>
      ))}
      {more > 0 ? <li className="list-none text-content-muted">and {more} more</li> : null}
    </ul>
  );
}

/** The checkout's folder with Copy path (from the registered workspaces). */
export function CheckoutPath({ path }: { readonly path: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-body-sm">
      <span className={MONO}>{path}</span>
      <CopyAction text={path} label="Copy path" />
    </div>
  );
}

/** The Close dialog's warning about the way out SpecFlow does not offer. */
export function DiscardWarning() {
  return (
    <InlineNote tone="attention">
      <strong className="font-medium">Commit them first.</strong> If you discard them instead (for
      example with git restore or git clean), they are gone for good: Git keeps no copy of
      uncommitted work.
    </InlineNote>
  );
}

/** A link inside running text (a Session, a document). */
export function TextLink({ children }: { readonly children: ReactNode }) {
  return (
    <InlineAction className="text-body-sm" onClick={() => undefined}>
      {children}
    </InlineAction>
  );
}

/** The Now block's labelled paragraph with a left rule (the hand-off's look). */
export function QuoteBlock({
  label,
  children,
}: {
  readonly label: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className="grid gap-1 border-border-default @min-[40rem]/app-content:border-l-2 @min-[40rem]/app-content:pl-3">
      <Typography as="p" variant="body-sm" className="text-content-secondary">
        {label}
      </Typography>
      <Typography
        as="p"
        variant="body-sm"
        className="whitespace-pre-line text-content-primary [overflow-wrap:anywhere]"
      >
        {children}
      </Typography>
    </div>
  );
}

/** The Goal under the position (the Task Now's own Goal block). */
export function Goal({ text }: { readonly text: string }) {
  return (
    <div className="grid gap-1">
      <Typography as="p" variant="label-sm" className="text-content-secondary">
        Goal
      </Typography>
      <Typography
        as="p"
        variant="body-md"
        className="text-content-primary [overflow-wrap:anywhere]"
      >
        {text}
      </Typography>
    </div>
  );
}

/** An icon on the first text line. */
export function LineIcon({
  name,
  className,
}: {
  readonly name: Parameters<typeof Icon>[0]['name'];
  readonly className?: string;
}) {
  return (
    <span className={cn('mr-1 inline-flex h-[1lh] items-center align-top', className)}>
      <Icon name={name} size="sm" aria-hidden="true" />
    </span>
  );
}
