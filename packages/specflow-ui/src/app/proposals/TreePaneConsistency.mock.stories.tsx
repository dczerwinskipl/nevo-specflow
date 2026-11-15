import { useEffect, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import documentsMeta from '../../features/documents/workspace/DocumentsArchetypes.stories';
import readerMeta from '../../features/docs/reader/DocsReader.stories';

/*
 * MOCK, proposal awaiting owner acceptance (component-guidelines "Tree pane consistency"). Not a
 * production path: the real Documents and Documentation screens render unchanged ("before"), or
 * with a stylesheet that approximates the proposed shared geometry ("after"). Production will get
 * the geometry from shared components (`TreeSearchBar`, `TreeSearchEmpty`, the pane stack), not
 * from CSS overrides; the overrides only exist to compare the result on the real screens.
 *
 * Approximations of this mock (not part of the proposal): the Documentation search and its list are
 * siblings in a 12 px grid here, so one negative margin pulls the list up to the 4 px tree-block
 * gap; production wraps the search and the list in one `gap-1` grid and has no negative margin.
 * The stuck state is set by a scroll listener here; production uses the `useStuck` sentinel. The
 * gaps around the Documentation status row ("6 wyników" and the proposals checkbox) are out of
 * scope and unchanged.
 */

const Documents = documentsMeta.component;
const Reader = readerMeta.component;

/** The opaque stuck surface the proposal reuses: `.workspace-docked-bar` (workspace material over the canvas). */
const dockedMaterial =
  'linear-gradient(var(--color-workspace-material), var(--color-workspace-material)), var(--color-canvas)';

const proposalCss = `
/* Search container at rest: the pane's own surface, no band, no divider. */
[role="search"] {
  margin: 0 !important;
  padding: 4px 12px !important;
  background: transparent !important;
  border-bottom: 1px solid transparent !important;
}
/* Stuck (Documentation only, sticky is opt-in): opaque docked material and one divider. */
[role="search"][data-mock-stuck] {
  background: ${dockedMaterial} !important;
  border-bottom-color: var(--color-divider) !important;
}
/* Documentation pane: vertical inset on the scroller content, the 8 px inline inset on each block,
   so the sticky bar can span the pane without negative margins. */
[data-mock-docs-pane] {
  padding-inline: 0 !important;
}
[data-mock-docs-pane] > :not([role="search"]) {
  margin-inline: 8px;
}
/* MOCK APPROXIMATION: production wraps search + list in one gap-1 grid (no negative margin). */
[data-mock-docs-pane] > [role="search"] + * {
  margin-top: -8px;
}
/* Empty result text on the pane's text column (16 px from the pane edge): the Documentation
   results wrapper already adds px-2, so the empty state adds no inline padding of its own there. */
[data-mock-docs-pane] [data-empty-state] {
  padding-left: 0 !important;
}
/* Documents: the search row of the filter bar is the same container (4 px block padding). */
.grid.gap-1.px-1 > .flex:has(input[type="search"]) {
  padding-block: 4px;
}
/* Pane stack: the back link row is one 24 px box (hit area expands, layout does not), then the
   pane gap (12 px), with no margins of its own. */
[data-application-context] {
  margin-bottom: 12px !important;
}
[data-application-context] a {
  min-height: var(--spacing-target-min, 24px) !important;
}
/* Empty search result in a tree pane: EmptyState inline, no icon, small secondary action. */
[data-empty-state="default"] {
  min-height: 0 !important;
  flex-direction: column !important;
  align-items: flex-start !important;
  justify-content: flex-start !important;
  border: 0 !important;
  border-radius: 0 !important;
  padding: 8px !important;
  text-align: left !important;
}
[data-empty-state="default"] > [data-design-slot="icon"] { display: none !important; }
[data-empty-state="default"] > [data-design-slot="title"] {
  max-width: none !important;
  font-size: var(--text-body-md) !important;
  line-height: var(--text-body-md--line-height) !important;
  font-weight: 500 !important;
  text-wrap: wrap !important;
}
[data-empty-state="default"] > [data-design-slot="description"] {
  max-width: none !important;
  margin-top: 2px !important;
  font-size: var(--text-body-sm) !important;
  line-height: var(--text-body-sm--line-height) !important;
  text-wrap: wrap !important;
}
[data-empty-state="default"] > [data-design-slot="actions"] {
  margin-top: 12px !important;
  justify-content: flex-start !important;
}
[data-empty-state="default"] > [data-design-slot="actions"] button {
  min-height: var(--spacing-control-height-compact) !important;
  padding: calc((var(--spacing-control-height-compact) - 2px - var(--text-label-sm--line-height)) / 2) var(--spacing-control-padding-compact) !important;
  font-size: var(--text-label-sm) !important;
  line-height: var(--text-label-sm--line-height) !important;
}
`;

/** Marks the Documentation pane content and toggles the stuck state of the search bar (mock only). */
function useMockMarkers(enabled: boolean) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const mark = () => {
      const bar = document.querySelector<HTMLElement>('[role="search"]');
      const content = bar?.parentElement;
      if (!bar || !content) {
        return;
      }

      content.setAttribute('data-mock-docs-pane', '');
      const scroller = content.parentElement;
      const stuck = scroller
        ? bar.getBoundingClientRect().top <= scroller.getBoundingClientRect().top + 0.5 &&
          scroller.scrollTop > 0
        : false;
      bar.toggleAttribute('data-mock-stuck', stuck);
    };

    const observer = new MutationObserver(mark);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('scroll', mark, { capture: true, passive: true });
    mark();

    return () => {
      observer.disconnect();
      document.removeEventListener('scroll', mark, { capture: true });
    };
  }, [enabled]);
}

interface MockArgs {
  screen: 'documents' | 'documentation';
  proposal: boolean;
  documents?: ComponentProps<typeof Documents>;
  reader?: ComponentProps<typeof Reader>;
}

function TreePaneConsistency({ screen, proposal, documents, reader }: MockArgs) {
  useMockMarkers(proposal);

  return (
    <>
      {proposal && <style>{proposalCss}</style>}
      {screen === 'documents' ? (
        <Documents scenario="plain" path="/specs/sso/documents" locale="pl" {...documents} />
      ) : (
        <Reader path="/docs" scenario="reader" locale="pl" {...reader} />
      )}
    </>
  );
}

const meta = {
  title: 'SpecFlow/Proposals/Tree pane consistency',
  component: TreePaneConsistency,
  tags: ['!test', '!autodocs'],
  parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true } },
  args: { screen: 'documents', proposal: false },
} satisfies Meta<typeof TreePaneConsistency>;
export default meta;
type Story = StoryObj<typeof meta>;

export const DocumentsBefore: Story = { args: { screen: 'documents', proposal: false } };
export const DocumentsAfter: Story = { args: { screen: 'documents', proposal: true } };
export const DocumentationBefore: Story = { args: { screen: 'documentation', proposal: false } };
export const DocumentationAfter: Story = { args: { screen: 'documentation', proposal: true } };
