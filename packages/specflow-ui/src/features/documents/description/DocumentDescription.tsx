import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Typography } from '@nevo/ui';
import { DisclosureToggle } from '../../../shared/actions';
import { useTranslation } from 'react-i18next';

export function descriptionScrollOwner(node: HTMLElement): HTMLElement {
  let parent = node.parentElement;
  while (parent) {
    if (
      /(auto|scroll)/.test(getComputedStyle(parent).overflowY) &&
      parent.scrollHeight > parent.clientHeight + 1
    ) {
      return parent;
    }

    parent = parent.parentElement;
  }

  return document.scrollingElement as HTMLElement;
}

/**
 * A description held to three lines (interaction-model.md "Visual conventions"), with the shared
 * disclosure to the rest: the full document when there is one (it mounts lazily; its
 * query/authorization stays with Documents), else the whole description.
 */
export function DocumentDescription({
  intro,
  hasMore = false,
  renderDocument,
  expanded: controlledExpanded,
  savedScrollTop,
  onExpandedChange,
  labels,
}: {
  readonly intro?: string | null;
  readonly hasMore?: boolean;
  readonly renderDocument?: () => ReactNode;
  readonly expanded?: boolean;
  readonly savedScrollTop?: number;
  readonly onExpandedChange?: (expanded: boolean, scrollTop: number) => void;
  readonly labels?: { readonly expand: string; readonly collapse: string };
}) {
  const { t } = useTranslation();
  const id = useId();
  const [localExpanded, setExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  const control = useRef<HTMLButtonElement>(null);
  const introRef = useRef<HTMLElement>(null);
  // The intro runs past its three lines: the rest is reachable even without a document.
  const [overflowing, setOverflowing] = useState(false);
  useLayoutEffect(() => {
    const node = introRef.current;
    if (!node) {
      return;
    }

    const measure = () => setOverflowing(node.scrollHeight > node.clientHeight + 1);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    measure();

    return () => observer?.disconnect();
  }, [intro]);
  const saved = useRef<{ owner: HTMLElement; top: number } | null>(null);
  const restore = useRef(false);
  useLayoutEffect(() => {
    if (!restore.current) {
      return;
    }

    const position =
      saved.current ??
      (control.current && savedScrollTop !== undefined
        ? { owner: descriptionScrollOwner(control.current), top: savedScrollTop }
        : null);
    if (position) {
      position.owner.scrollTop = position.top;
    }

    control.current?.focus({ preventScroll: true });
    restore.current = false;
  }, [expanded, savedScrollTop]);
  const toggle = () => {
    if (!expanded && control.current) {
      const owner = descriptionScrollOwner(control.current);
      saved.current = { owner, top: owner.scrollTop };
    }

    restore.current = true;
    onExpandedChange?.(!expanded, saved.current?.top ?? savedScrollTop ?? 0);
    setExpanded(!expanded);
  };

  if (!intro && !renderDocument) {
    return null;
  }

  const withDocument = hasMore && renderDocument !== undefined;
  // Expanding shows the document when there is one, else the description without its clamp.
  const showsToggle = withDocument || overflowing || (expanded && !withDocument);
  const label = expanded
    ? (labels?.collapse ?? t('taskDetails.showLess'))
    : intro
      ? (labels?.expand ?? t('taskDetails.showMore'))
      : t('taskDetails.showDescription');

  return (
    <div className="mt-2 grid min-w-0 justify-items-start gap-1 [overflow-wrap:anywhere]">
      {intro && !(expanded && withDocument) ? (
        <Typography
          ref={introRef}
          variant="body-md"
          className={expanded ? 'text-content-secondary' : 'line-clamp-3 text-content-secondary'}
        >
          {intro}
        </Typography>
      ) : null}
      {showsToggle ? (
        <DisclosureToggle
          ref={control}
          expanded={expanded}
          aria-controls={withDocument ? id : undefined}
          onClick={toggle}
        >
          {label}
        </DisclosureToggle>
      ) : null}
      {withDocument ? (
        <div id={id} className="w-full min-w-0" hidden={!expanded}>
          {expanded ? renderDocument?.() : null}
        </div>
      ) : null}
      {expanded && withDocument ? (
        <DisclosureToggle expanded aria-controls={id} onClick={toggle}>
          {labels?.collapse ?? t('taskDetails.showLess')}
        </DisclosureToggle>
      ) : null}
    </div>
  );
}
