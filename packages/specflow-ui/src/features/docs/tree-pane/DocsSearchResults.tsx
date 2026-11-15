import { useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, EmptyState, cn } from '@nevo/ui';
import type { WorkspaceDocsSearchHit, WorkspaceDocsSearch } from '@nevo/specflow-contracts/docs';
import { textMeasurer } from '../../../shared/text-measure/measureText';
import {
  excerptSegments,
  parentFits,
  sectionPathOf,
  sectionPathSeparator,
  type SectionPath,
} from './searchResultModel';
import { TreeSkeleton } from './TreeSkeleton';

/**
 * Whether the path's parent fits whole beside its leaf in the line box, measured in the box's font.
 * Re-measured when the box resizes and once web fonts are ready. Until measured (no layout, no
 * canvas) only the leaf shows: the parent is never cut.
 */
function useParentFits(path: SectionPath | undefined) {
  const [element, ref] = useState<HTMLElement | null>(null);
  const [fits, setFits] = useState(false);
  const parent = path?.parent;
  const leaf = path?.leaf;

  useLayoutEffect(() => {
    if (!element || parent === undefined || leaf === undefined) {
      return;
    }

    let disposed = false;
    const measure = () => {
      if (disposed) {
        return;
      }

      const width = textMeasurer(element);
      setFits(
        width !== null &&
          parentFits({
            parent: width(parent),
            separator: width(sectionPathSeparator),
            leaf: width(leaf),
            // Whole pixels: a sub-pixel overflow would end the leaf in an ellipsis.
            available: Math.floor(element.getBoundingClientRect().width),
          }),
      );
    };

    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    void document.fonts?.ready.then(measure);

    return () => {
      disposed = true;
      observer?.disconnect();
    };
  }, [element, parent, leaf]);

  return { ref, showParent: parent !== undefined && fits };
}

/** One line, at most `parent › leaf`; only the leaf may end in an ellipsis. */
function SectionPathLine({ path }: { path: SectionPath }) {
  const { ref, showParent } = useParentFits(path);

  return (
    <span ref={ref} className="truncate text-body-sm text-content-muted">
      {showParent && `${path.parent}${sectionPathSeparator}`}
      {path.leaf}
    </span>
  );
}

/** The excerpt with the words the answer marked: `content-primary` at medium weight, no fill. */
function Excerpt({
  snippet,
  matches,
}: {
  snippet: string;
  matches: Parameters<typeof excerptSegments>[1];
}) {
  return (
    <span className="line-clamp-2 text-body-sm text-content-muted">
      {excerptSegments(snippet, matches).map((segment, index) =>
        segment.marked ? (
          <mark key={index} className="bg-transparent font-medium text-content-primary">
            {segment.text}
          </mark>
        ) : (
          segment.text
        ),
      )}
    </span>
  );
}

function ResultRow({
  hit,
  proposal,
  active,
  onOpen,
}: {
  hit: WorkspaceDocsSearchHit;
  proposal: boolean;
  active: boolean;
  onOpen: (documentId: string, sectionId?: string) => void;
}) {
  const { t } = useTranslation();
  const section = hit.sections[0];
  const path = section && sectionPathOf(hit.title, section.headingPath);

  return (
    <li>
      <button
        type="button"
        title={path?.full}
        aria-current={active ? 'true' : undefined}
        onClick={() => onOpen(hit.id, section?.sectionId)}
        className={cn(
          'grid min-h-(--target-size) w-full min-w-0 gap-0.5 rounded-control px-2 py-1.5 text-left outline-none',
          'hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring',
          'aria-[current=true]:bg-surface-selected',
        )}
      >
        <span className="flex min-w-0 items-start gap-2">
          <span className="line-clamp-2 min-w-0 flex-1 text-title-sm text-content-primary">
            {hit.title}
          </span>
          {proposal && (
            <Badge size="compact" className="mt-0.5 shrink-0">
              {t('docs.search.proposal')}
            </Badge>
          )}
        </span>
        {path && <SectionPathLine path={path} />}
        {section?.snippet && <Excerpt snippet={section.snippet} matches={section.snippetMatches} />}
      </button>
    </li>
  );
}

/**
 * The rows of a search, replacing the tree while the field has text: one row per document (title
 * with the Proposal badge, at most `parent › leaf` of the best section, its excerpt with the
 * matched words marked), separated by divider lines. The count, the quiet lines and the proposals
 * checkbox are the search's status row above (`DocsSearchPanel`).
 *
 * While a newer answer is awaited, `dimmed` keeps the earlier rows in place, at half opacity and
 * inert; `skeleton` stands in when there are no earlier rows.
 */
export function DocsSearchResults({
  search,
  skeleton,
  dimmed,
  failed,
  proposals,
  activeDocumentId,
  onClear,
  onRetry,
  onOpen,
}: {
  /** The answer on screen: the settled one, or the earlier one while `dimmed`. */
  search?: WorkspaceDocsSearch;
  skeleton: boolean;
  dimmed: boolean;
  failed: boolean;
  /** Ids of the tree's proposals (the hits carry no flag of their own). */
  proposals: ReadonlySet<string>;
  activeDocumentId?: string;
  onClear: () => void;
  onRetry: () => void;
  onOpen: (documentId: string, sectionId?: string) => void;
}) {
  const { t } = useTranslation();
  if (failed) {
    return (
      <div className="px-1">
        <Button variant="ghost" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  if (skeleton) {
    // The search's status row says it once the wait is long.
    return <TreeSkeleton />;
  }

  if (!search) {
    return null;
  }

  if (search.results.length === 0) {
    return (
      <div className="px-2">
        <EmptyState
          variant="inline"
          title={t('docs.search.noMatches')}
          description={
            search.proposalsLeftOut > 0
              ? t('docs.search.onlyProposals', { count: search.proposalsLeftOut })
              : t('docs.search.noMatchesHint')
          }
          actions={
            <Button variant="secondary" size="sm" onClick={onClear}>
              {t('common.clearSearch')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <section
      aria-label={t('docs.search.results')}
      aria-busy={dimmed || undefined}
      inert={dimmed}
      className={cn(dimmed && 'opacity-50')}
    >
      <ul className="m-0 grid list-none divide-y divide-divider p-0">
        {search.results.map((hit) => (
          <ResultRow
            key={hit.id}
            hit={hit}
            proposal={proposals.has(hit.id)}
            active={hit.id === activeDocumentId}
            onOpen={onOpen}
          />
        ))}
      </ul>
    </section>
  );
}
