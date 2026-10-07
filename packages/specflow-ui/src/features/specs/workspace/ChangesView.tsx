import { Button, SegmentedControl, Typography } from '@nevo/ui';
import { useTranslation } from 'react-i18next';

export interface ChangesViewProps {
  readonly currentSource: 'base' | 'uncommitted' | 'mr';
  readonly onSourceChange: (source: 'base' | 'uncommitted' | 'mr') => void;
  readonly onDiff: (file: string) => void;
}

const sampleFiles = [
  'src/auth/refreshSession.ts',
  'src/auth/refreshSession.integration.test.ts',
  'src/ui/SessionExpiredNotice.tsx',
  'docs/areas/authentication.md',
];

export function ChangesView({ currentSource, onSourceChange, onDiff }: ChangesViewProps) {
  const { t } = useTranslation();

  return (
    <div className="grid max-w-content-standard gap-6 py-2">
      <div>
        <Typography as="h1" variant="title-md" className="font-semibold text-content-primary">
          {t('specification.changesHeading')}
        </Typography>
        <Typography variant="body-sm" className="mt-1 text-content-muted">
          {t('specification.changesWorktreeContext')}
        </Typography>
      </div>

      <SegmentedControl
        value={currentSource}
        onValueChange={(val) => onSourceChange(val as 'base' | 'uncommitted' | 'mr')}
        aria-label={t('specification.changesSourceLabel')}
      >
        <SegmentedControl.Item value="base">
          {t('specification.changesSourceBase')}
        </SegmentedControl.Item>
        <SegmentedControl.Item value="uncommitted">
          {t('specification.changesSourceUncommitted')}
        </SegmentedControl.Item>
        <SegmentedControl.Item value="mr">
          {t('specification.changesSourcePr')}
        </SegmentedControl.Item>
      </SegmentedControl>

      <Typography variant="body-sm" className="text-content-secondary">
        {currentSource === 'base'
          ? t('specification.changesBaseDescription')
          : currentSource === 'uncommitted'
            ? t('specification.changesUncommittedDescription')
            : t('specification.changesPrDescription')}
      </Typography>

      <div className="divide-y divide-border-subtle">
        {sampleFiles.map((file) => (
          <div key={file} className="flex items-center justify-between gap-4 py-3">
            <span className="font-mono text-body-sm text-content-primary [overflow-wrap:anywhere]">
              {file}
            </span>
            <Button variant="secondary" size="sm" onClick={() => onDiff(file)}>
              {t('specification.diffAction')}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
