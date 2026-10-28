import { useMemo, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../../../lib';
import { Link } from '../../actions/Link';
import { Typography } from '../../foundations/Typography';
import { ScrollArea } from '../../layout/ScrollArea';

export interface MarkdownDocumentLinkProps {
  children: ReactNode;
  href?: string;
  title?: string;
}

export interface MarkdownDocumentProps {
  source: string;
  className?: string;
  labels?: Partial<MarkdownDocumentLabels>;
  /** Semantic offset when embedded below a view title; visual styles remain unchanged. */
  headingOffset?: 0 | 1 | 2 | 3 | 4 | 5;
  /**
   * Product-owned link/reference renderer. Return null/undefined to keep the shared default link.
   * Use it to turn workspace-relative references into contextual navigation without reimplementing
   * Markdown parsing or normal external-link styling.
   */
  renderLink?: (props: MarkdownDocumentLinkProps) => ReactNode;
  /**
   * Opt-in source map: emits `data-source-line="<1-based start line>"` on top-level block elements
   * and on every list item, so a product can keep an edit/preview scroll position by source line
   * (find the last block whose top is at or above the viewport top). Off by default; the rendered
   * markup and classes are otherwise identical.
   */
  sourceLines?: boolean;
}

export interface MarkdownDocumentLabels {
  completedTask: string;
  incompleteTask: string;
  /** Accessible name of a horizontally scrollable table region. */
  table: string;
  /** Accessible name of a horizontally scrollable code block region. */
  codeBlock: string;
}

const defaultMarkdownDocumentLabels: MarkdownDocumentLabels = {
  completedTask: 'Completed task',
  incompleteTask: 'Incomplete task',
  table: 'Table',
  codeBlock: 'Code block',
};

function DefaultMarkdownLink({ children, href, title }: MarkdownDocumentLinkProps) {
  return (
    <Link href={href} rel="noreferrer noopener" target="_blank" title={title}>
      {children}
    </Link>
  );
}

interface SourceNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  position?: { start?: { line?: number } };
  children?: SourceNode[];
}

/** Rehype step for `sourceLines`: top-level block elements and every `li` carry their start line. */
function rehypeSourceLines() {
  const mark = (node: SourceNode) => {
    const line = node.position?.start?.line;
    if (node.type === 'element' && line !== undefined) {
      node.properties = { ...node.properties, dataSourceLine: line };
    }
  };
  const walkItems = (node: SourceNode) => {
    for (const child of node.children ?? []) {
      if (child.type === 'element' && child.tagName === 'li') mark(child);
      walkItems(child);
    }
  };
  return (tree: SourceNode) => {
    for (const child of tree.children ?? []) mark(child);
    walkItems(tree);
  };
}

interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
}

// One comment, start to end: text between two comments on one line is not a comment.
const htmlComment = /^\s*<!--(?:(?!-->)[\s\S])*-->\s*$/;

/**
 * Remark step: an HTML comment (`<!-- note to the writer -->`) is not content. Raw HTML is never
 * rendered as markup here, so without this step the comment would be shown as literal text.
 */
function remarkDropHtmlComments() {
  const walk = (node: MdastNode) => {
    if (!node.children) return;
    node.children = node.children.filter(
      (child) => !(child.type === 'html' && htmlComment.test(child.value ?? '')),
    );
    for (const child of node.children) walk(child);
  };
  return walk;
}

/** react-markdown forwards hast properties as props; keep the source line on the rendered block. */
function sourceLine(props: object): { 'data-source-line'?: number } {
  const line = (props as { 'data-source-line'?: number })['data-source-line'];
  return line === undefined ? {} : { 'data-source-line': line };
}

function markdownComponents(
  labels: MarkdownDocumentLabels,
  renderLink?: (props: MarkdownDocumentLinkProps) => ReactNode,
  headingOffset = 0,
): Components {
  const heading = (level: number) =>
    `h${Math.min(6, level + headingOffset)}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  return {
    h1: ({ children, ...rest }) => (
      <Typography
        {...sourceLine(rest)}
        as={heading(1)}
        className="mb-3 mt-8 text-content-primary first:mt-0"
        variant="title-lg"
      >
        {children}
      </Typography>
    ),
    h2: ({ children, ...rest }) => (
      <Typography
        {...sourceLine(rest)}
        as={heading(2)}
        className="mb-3 mt-6 border-b border-divider pb-2 text-content-primary first:mt-0"
        variant="title-md"
      >
        {children}
      </Typography>
    ),
    h3: ({ children, ...rest }) => (
      <Typography
        {...sourceLine(rest)}
        as={heading(3)}
        className="mb-2 mt-5 text-content-primary first:mt-0"
        variant="title-sm"
      >
        {children}
      </Typography>
    ),
    h4: ({ children, ...rest }) => (
      <Typography
        {...sourceLine(rest)}
        as={heading(4)}
        className="mb-2 mt-4 text-content-primary first:mt-0"
        variant="label-md"
      >
        {children}
      </Typography>
    ),
    h5: ({ children, ...rest }) => (
      <Typography
        {...sourceLine(rest)}
        as={heading(5)}
        className="mb-2 mt-4 text-content-primary first:mt-0"
        variant="label-md"
      >
        {children}
      </Typography>
    ),
    h6: ({ children, ...rest }) => (
      <Typography
        {...sourceLine(rest)}
        as={heading(6)}
        className="mb-2 mt-4 text-content-muted first:mt-0"
        variant="label-sm"
      >
        {children}
      </Typography>
    ),
    p: ({ children, ...rest }) => (
      <Typography
        {...sourceLine(rest)}
        as="p"
        className="my-3 text-content-secondary first:mt-0 last:mb-0"
        variant="body-lg"
      >
        {children}
      </Typography>
    ),
    ul: ({ children, className, ...rest }) => (
      <Typography
        {...sourceLine(rest)}
        as="ul"
        className={cn(
          'my-3 list-disc pl-6 text-content-secondary first:mt-0 last:mb-0 [li_&]:my-1',
          className?.includes('contains-task-list') && 'list-none pl-0',
        )}
        variant="body-lg"
      >
        {children}
      </Typography>
    ),
    ol: ({ children, ...rest }) => (
      <Typography
        {...sourceLine(rest)}
        as="ol"
        className="my-3 list-decimal pl-6 text-content-secondary first:mt-0 last:mb-0 [li_&]:my-1"
        variant="body-lg"
      >
        {children}
      </Typography>
    ),
    li: ({ children, className, ...rest }) => (
      <li {...sourceLine(rest)} className={cn('mt-1 first:mt-0', className)}>
        {children}
      </li>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold text-content-primary">{children}</strong>
    ),
    a: ({ children, href, title }) =>
      renderLink?.({ children, href, title }) ?? (
        <DefaultMarkdownLink href={href} title={title}>
          {children}
        </DefaultMarkdownLink>
      ),
    blockquote: ({ children, ...rest }) => (
      <blockquote
        {...sourceLine(rest)}
        className="my-3 border-l-2 border-border-strong pl-4 text-content-muted first:mt-0 last:mb-0 [&_p]:text-body-md [&_p]:text-content-muted"
      >
        {children}
      </blockquote>
    ),
    code: ({ children, className }) => (
      <Typography
        as="code"
        className={cn(
          'rounded-control-inline border border-border-default bg-surface-control px-1.5 py-0.5 text-content-secondary',
          className,
        )}
        variant="code-md"
      >
        {children}
      </Typography>
    ),
    pre: ({ children, ...rest }) => (
      // The block scrolls horizontally in its own keyboard-focusable region; lines never wrap.
      <ScrollArea
        {...sourceLine(rest)}
        aria-label={labels.codeBlock}
        className="my-3 rounded-composite border border-border-default bg-canvas first:mt-0 last:mb-0"
        direction="horizontal"
        labelRole="group"
        viewportClassName="rounded-composite"
      >
        <pre className="w-max min-w-full px-4 py-3 text-content-secondary [&_code]:border-0 [&_code]:bg-transparent [&_code]:p-0">
          {children}
        </pre>
      </ScrollArea>
    ),
    hr: (props) => <hr {...sourceLine(props)} className="my-6 border-0 border-t border-divider" />,
    input: ({ node: _node, type, ...props }) => (
      <input
        {...props}
        aria-label={props.checked ? labels.completedTask : labels.incompleteTask}
        className="mr-2 accent-action-primary"
        disabled
        type={type}
      />
    ),
    img: ({ node: _node, alt, src, title }) => (
      <img alt={alt ?? ''} className="my-3 h-auto max-w-full" src={src} title={title} />
    ),
    table: ({ children, ...rest }) => (
      // A wide table scrolls in its own keyboard-focusable region and never widens the page.
      <ScrollArea
        {...sourceLine(rest)}
        aria-label={labels.table}
        className="my-3 rounded-composite border border-border-default first:mt-0 last:mb-0"
        direction="horizontal"
        labelRole="group"
        viewportClassName="rounded-composite"
      >
        <table className="min-w-full border-collapse [&_tbody_tr:nth-child(even)]:bg-surface-subtle [&_tbody_tr+tr]:border-t [&_tbody_tr+tr]:border-divider">
          {children}
        </table>
      </ScrollArea>
    ),
    th: ({ children, style }) => (
      <th
        className="min-w-40 border-b border-border-default bg-surface-raised px-3 py-2 text-left align-bottom [overflow-wrap:break-word]"
        style={{ textAlign: style?.textAlign }}
      >
        <Typography as="span" className="text-content-primary" variant="label-md">
          {children}
        </Typography>
      </th>
    ),
    td: ({ children, style }) => (
      <td
        className="min-w-40 px-3 py-2 text-left align-top [overflow-wrap:break-word]"
        style={{ textAlign: style?.textAlign }}
      >
        <Typography as="span" className="text-content-secondary" variant="body-md">
          {children}
        </Typography>
      </td>
    ),
  };
}

export function MarkdownDocument({
  className,
  labels: labelsProp,
  renderLink,
  source,
  sourceLines = false,
  headingOffset = 0,
}: MarkdownDocumentProps) {
  const { completedTask, incompleteTask, table, codeBlock } = {
    ...defaultMarkdownDocumentLabels,
    ...labelsProp,
  };
  // Stable renderer types preserve mounted links, selection and reading DOM on ordinary refresh.
  const components = useMemo(
    () =>
      markdownComponents(
        { completedTask, incompleteTask, table, codeBlock },
        renderLink,
        headingOffset,
      ),
    [completedTask, incompleteTask, table, codeBlock, renderLink, headingOffset],
  );
  return (
    <div className={cn('w-full min-w-0 max-w-full [overflow-wrap:anywhere]', className)}>
      <ReactMarkdown
        components={components}
        rehypePlugins={sourceLines ? [rehypeSourceLines] : []}
        remarkPlugins={[remarkGfm, remarkDropHtmlComments]}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
