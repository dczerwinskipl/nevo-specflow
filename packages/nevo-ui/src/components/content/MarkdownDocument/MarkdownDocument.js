import { jsx as _jsx } from "react/jsx-runtime";
import ReactMarkdown, {} from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../../../lib';
import { Link } from '../../actions/Link';
import { Typography } from '../../foundations/Typography';
const components = {
    h1: ({ children }) => (_jsx(Typography, { as: "h1", className: "mb-3 mt-8 text-content-primary first:mt-0", variant: "title-lg", children: children })),
    h2: ({ children }) => (_jsx(Typography, { as: "h2", className: "mb-3 mt-6 border-b border-divider pb-2 text-content-primary first:mt-0", variant: "title-md", children: children })),
    h3: ({ children }) => (_jsx(Typography, { as: "h3", className: "mb-2 mt-5 text-content-primary first:mt-0", variant: "title-sm", children: children })),
    h4: ({ children }) => (_jsx(Typography, { as: "h4", className: "mb-2 mt-4 text-content-primary first:mt-0", variant: "label-md", children: children })),
    p: ({ children }) => (_jsx(Typography, { as: "p", className: "my-3 text-content-secondary first:mt-0 last:mb-0", variant: "body-lg", children: children })),
    ul: ({ children, className }) => (_jsx(Typography, { as: "ul", className: cn('my-3 list-disc pl-6 text-content-secondary first:mt-0 last:mb-0', className?.includes('contains-task-list') && 'list-none pl-0'), variant: "body-lg", children: children })),
    ol: ({ children }) => (_jsx(Typography, { as: "ol", className: "my-3 list-decimal pl-6 text-content-secondary first:mt-0 last:mb-0", variant: "body-lg", children: children })),
    li: ({ children, className }) => _jsx("li", { className: cn('mt-1 first:mt-0', className), children: children }),
    strong: ({ children }) => (_jsx("strong", { className: "font-semibold text-content-primary", children: children })),
    a: ({ children, href, title }) => (_jsx(Link, { href: href, rel: "noreferrer noopener", target: "_blank", title: title, children: children })),
    blockquote: ({ children }) => (_jsx("blockquote", { className: "my-3 border-l-2 border-border-strong pl-4 text-content-muted first:mt-0 last:mb-0 [&_p]:text-body-md [&_p]:text-content-muted", children: children })),
    code: ({ children, className }) => (_jsx(Typography, { as: "code", className: cn('rounded-control-inline border border-border-default bg-surface-control px-1.5 py-0.5 text-content-secondary', className), variant: "code-md", children: children })),
    pre: ({ children }) => (_jsx("pre", { className: "my-3 max-w-full overflow-x-auto rounded-composite border border-border-default bg-canvas px-4 py-3 text-content-secondary first:mt-0 last:mb-0 [&_code]:border-0 [&_code]:bg-transparent [&_code]:p-0", children: children })),
    hr: () => _jsx("hr", { className: "my-6 border-0 border-t border-divider" }),
    input: ({ node: _node, type, ...props }) => (_jsx("input", { ...props, "aria-label": props.checked ? 'Completed task' : 'Incomplete task', className: "mr-2 accent-action-primary", disabled: true, type: type })),
    table: ({ children }) => (_jsx("div", { className: "my-3 w-full max-w-full overflow-x-auto first:mt-0 last:mb-0", children: _jsx("table", { className: "min-w-full border-collapse", children: children }) })),
    th: ({ children }) => (_jsx("th", { className: "border border-border-default bg-surface-raised px-3 py-2 text-left", children: _jsx(Typography, { as: "span", className: "text-content-primary", variant: "label-md", children: children }) })),
    td: ({ children }) => (_jsx("td", { className: "border border-border-default px-3 py-2 text-left", children: _jsx(Typography, { as: "span", className: "text-content-secondary", variant: "body-md", children: children }) })),
};
export function MarkdownDocument({ className, source }) {
    return (_jsx("div", { className: cn('w-full min-w-0 max-w-full [overflow-wrap:anywhere]', className), children: _jsx(ReactMarkdown, { components: components, remarkPlugins: [remarkGfm], children: source }) }));
}
//# sourceMappingURL=MarkdownDocument.js.map