import type { ReactNode } from 'react';
import { Circle, MessageCircleWarning } from 'lucide-react';
import { hitAreaBlockClassName, Icon, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { SessionNavigationEntry } from './summary';
// The icon column is the DS small icon size; the section content below aligns with the text column.
const rowClassName = 'grid grid-cols-[var(--spacing-icon-sm)_minmax(0,1fr)] gap-x-2 py-1.5';
const linkClassName = `-mx-2 rounded-control px-2 hover:bg-surface-hover ${hitAreaBlockClassName}`;
/** Sessions owns the conservative state copy and presentation of provided titles. */
export function SessionNavigationPreview({
  entries,
  renderEntryLink,
  children,
}: {
  entries: readonly SessionNavigationEntry[];
  /** When the session detail destination exists, each preview row becomes one link target. */
  renderEntryLink?: (sessionId: string, className: string, children: ReactNode) => ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="px-2 py-2" data-session-navigation-preview>
      {entries.map((session) => {
        const attention = session.activityCode === 'attention';
        const tone = attention ? 'text-status-attention' : 'text-status-info';
        const content = (
          <>
            {/* As tall as the first text line (body-md), so the icon centres on it without a pixel nudge. */}
            <span className="flex h-5 shrink-0 items-center">
              <Icon
                name={attention ? MessageCircleWarning : Circle}
                size="sm"
                className={`size-icon-sm ${tone}`}
              />
            </span>
            <div>
              <Typography
                as="span"
                variant="body-md"
                className="block text-content-primary [overflow-wrap:anywhere]"
              >
                {session.title}
              </Typography>
              <Typography as="span" variant="body-sm" className={`mt-0.5 block ${tone}`}>
                {t(
                  attention
                    ? 'applicationNavigation.needsAttention'
                    : 'applicationNavigation.active',
                )}
              </Typography>
            </div>
          </>
        );
        return renderEntryLink ? (
          <div key={session.id} data-session-navigation-entry>
            {renderEntryLink(session.id, `${rowClassName} ${linkClassName}`, content)}
          </div>
        ) : (
          <div key={session.id} className={rowClassName} data-session-navigation-entry>
            {content}
          </div>
        );
      })}
      <div className="ml-[calc(var(--spacing-icon-sm)+var(--spacing)*2)]">{children}</div>
    </div>
  );
}
