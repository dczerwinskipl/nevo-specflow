import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReaderMock } from './ReaderMock.stories-support';

/*
 * PRESENTATION MOCK ONLY (design validation for docs/product/specflow/ui/documentation-reader.md).
 * Not production code: static data, local state instead of routes, no backend. The frame is the
 * viewport: resize it to see Wide (>= 1108), Compact and Narrow. No Chromatic snapshots, no
 * interaction tests.
 */
const meta = {
  title: 'SpecFlow/Screens/Documentation reader (mock)',
  component: ReaderMock,
  parameters: { layout: 'fullscreen', chromatic: { disableSnapshot: true }, a11y: { test: 'off' } },
  args: { scenario: 'reader', workspaceId: 'ws-main', navEntry: 'global' },
  argTypes: {
    scenario: {
      control: 'select',
      options: [
        'reader',
        'specification-entry',
        'no-root-index',
        'loading',
        'not-configured',
        'skipped-one',
        'skipped-many',
        'empty-corpus',
        'forbidden',
        'workspace-unavailable',
        'unknown-document',
        'document-removed',
        'superseded-document',
        'index-building',
      ],
    },
    workspaceId: { control: 'inline-radio', options: ['ws-main', 'ws-sso', 'ws-reader'] },
  },
} satisfies Meta<typeof ReaderMock>;
export default meta;
type Story = StoryObj<typeof meta>;

/** First view: the tree and, on split layouts, the documentation's root index as the article. */
export const FirstView: Story = {};
/** A document opened from the tree (contents column on a wide panel, sheet otherwise). */
export const Article: Story = { args: { documentId: 'product.specflow.ui.interaction-model' } };
/** A search result opened at its section (deep link `#sectionId`). */
export const SearchResults: Story = {
  args: {
    query: 'back narrow',
    documentId: 'product.specflow.ui.interaction-model',
    sectionId: 'ui-interaction-model/back-and-close',
  },
};
export const SearchNoMatchOutsideIdeas: Story = { args: { query: 'workspace-aware reader' } };
export const SearchIncludingNonAuthoritative: Story = {
  args: { query: 'workspace reader', includeNonAuthoritative: true },
};
export const SearchIndexBuilding: Story = {
  args: { scenario: 'index-building', query: 'session expires' },
};
/** A linked worktree: the changed Authentication recovery (full hybrid search there too). */
export const FeatureWorktree: Story = {
  args: {
    workspaceId: 'ws-sso',
    query: 'session expires',
    documentId: 'product.specflow.ui.authentication-recovery',
  },
};
export const NonAuthoritativeDocument: Story = {
  args: { documentId: 'ideas.semantic-docs.surfaces-and-setup' },
};
export const PolishDocument: Story = { args: { documentId: 'docs.glossary-pl' } };
export const Loading: Story = {
  args: { scenario: 'loading', documentId: 'product.specflow.ui.interaction-model' },
};
export const NotConfigured: Story = {
  args: { scenario: 'not-configured', workspaceId: 'ws-reader' },
};
export const EmptyCorpus: Story = { args: { scenario: 'empty-corpus', workspaceId: 'ws-reader' } };
export const Forbidden: Story = { args: { scenario: 'forbidden' } };
export const WorkspaceUnavailable: Story = {
  args: { scenario: 'workspace-unavailable', workspaceId: 'ws-sso' },
};
export const UnknownDocument: Story = {
  args: { scenario: 'unknown-document', documentId: 'product.specflow.ui.single-sign-on' },
};
export const DocumentRemoved: Story = {
  args: { scenario: 'document-removed', documentId: 'ideas.semantic-docs.search-quality' },
};
export const SupersededDocument: Story = {
  args: { scenario: 'superseded-document', documentId: 'product.specflow.ui.navigation-v0' },
};
/** One invalid document: skipped, said once above the tree; the rest reads normally. */
export const SkippedOneDocument: Story = {
  args: { scenario: 'skipped-one', documentId: 'product.specflow.ui.interaction-model' },
};
/** Many invalid documents: one collapsible note; a link to a skipped document is inert. */
export const SkippedManyDocuments: Story = {
  args: { scenario: 'skipped-many', documentId: 'product.specflow.ui.interaction-model' },
};
/** Entered from a standalone Session: the Runtime's checkout, the way back, the switcher. */
export const StandaloneSessionEntry: Story = { args: { from: 'session' } };
/** A very long document title in the tree, the header and the article. */
export const LongTitle: Story = {
  args: { documentId: 'architecture.runtime.workspace-registry' },
};
/** Only the project folder is registered: no picker at all. */
export const SingleWorkspace: Story = { args: { singleWorkspace: true } };
/** Several workspaces: the picker at the top of the tree pane (closed; open it to choose). */
export const WorkspacePicker: Story = {
  args: { workspaceId: undefined, rememberedWorkspaceId: 'ws-sso' },
};
/** A Specification bound to a worktree; Documentation in the navigation then opens that worktree. */
export const SpecificationEntry: Story = {
  args: { scenario: 'specification-entry', workspaceId: undefined },
};
/** The remembered workspace was removed: the project folder, with a quiet notice. */
export const RememberedWorkspaceRemoved: Story = {
  args: { workspaceId: undefined, rememberedWorkspaceId: 'ws-removed-long-ago' },
};
/** The remembered workspace is registered but its folder is unavailable. */
export const RememberedWorkspaceUnavailable: Story = {
  args: { workspaceId: undefined, rememberedWorkspaceId: 'ws-gone' },
};
/** No root index (`docs/README.md`): one plain sentence beside the tree on split layouts. */
export const NoRootIndex: Story = { args: { scenario: 'no-root-index' } };
