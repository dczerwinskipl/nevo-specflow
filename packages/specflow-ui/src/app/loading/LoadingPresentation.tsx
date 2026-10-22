import { Skeleton, Typography, Timeline, InformationList, cn } from '@nevo/ui';
import { useTranslation } from 'react-i18next';

export type LoadingShape =
  | 'overview'
  | 'list'
  | 'summary'
  | 'specification'
  | 'task'
  | 'preview'
  | 'document'
  | 'history'
  | 'detail'
  | 'catalogue';

/** Product-owned geometry. Counts reserve a representative footprint, never imply result counts. */
export function LoadingPresentation({
  shape,
  label,
  fetching = true,
}: {
  readonly shape: LoadingShape;
  readonly label: string;
  readonly fetching?: boolean;
}) {
  const { t } = useTranslation();
  const line = (className: string) => <Skeleton className={className} animated={fetching} />;
  const bars = (short = false) => (
    <div className="grid min-w-0 gap-3" aria-hidden="true">
      {line('h-4 w-4/5')}
      {line('h-4 w-full')}
      {!short && line('h-4 w-3/5')}
    </div>
  );
  const rows = shape === 'overview' || shape === 'list' || shape === 'catalogue';
  return (
    <div
      role="status"
      aria-label={fetching ? label : t('loading.waitingForConnection')}
      className={cn(
        'grid min-w-0 w-full gap-6',
        (shape === 'specification' || shape === 'task') && 'max-w-content-standard',
      )}
      data-loading-shape={shape}
    >
      {!fetching && (
        <Typography variant="body-sm" className="text-content-muted">
          {t('loading.waitingForConnection')}
        </Typography>
      )}
      <div aria-hidden="true" aria-busy={fetching} className="grid min-w-0 gap-6">
        {shape === 'history' ? (
          <Timeline size="md">
            {Array.from({ length: 3 }, (_, i) => (
              <Timeline.Item key={i}>
                <Timeline.Marker tone="neutral" />
                <Timeline.Content title={line('h-4 w-3/5')}>{bars(true)}</Timeline.Content>
              </Timeline.Item>
            ))}
          </Timeline>
        ) : rows ? (
          <InformationList>
            {Array.from({ length: shape === 'catalogue' ? 3 : 4 }, (_, i) => (
              <InformationList.Item key={i} className="py-3">
                <InformationList.Content>{bars(true)}</InformationList.Content>
                {shape === 'overview' && <span className="w-8 shrink-0" />}
              </InformationList.Item>
            ))}
          </InformationList>
        ) : shape === 'document' ? (
          <>
            {bars()}
            {bars()}
          </>
        ) : shape === 'detail' || shape === 'summary' ? (
          bars()
        ) : (
          <>
            {line('h-7 w-3/5')}
            {line('h-3 w-2/5')}
            {shape === 'preview' ? (
              bars(true)
            ) : (
              <>
                {bars(shape === 'specification')}
                {bars()}
                {shape === 'specification' && bars()}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
