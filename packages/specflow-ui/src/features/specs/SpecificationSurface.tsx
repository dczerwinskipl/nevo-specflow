import {
  AppContent,
  AppContentContainer,
  AppWorkspace,
  AppWorkspaceBody,
  Icon,
  Link,
  Typography,
  WorkspaceHeader,
} from '@nevo/ui';
import { useTranslation } from 'react-i18next';

interface SpecificationSurfaceProps {
  readonly specId: string;
  readonly overviewHref: string;
  readonly onBack: () => void;
}

/** Stable owned destination, not a fabricated Specification read model or workflow screen. */
export function SpecificationSurface({ specId, overviewHref, onBack }: SpecificationSurfaceProps) {
  const { t } = useTranslation();
  return (
    <AppWorkspace
      split="primary"
      labels={{
        backToPrimary: t('navigation.back'),
        closeSecondary: t('navigation.closeSecondary'),
        openNavigation: t('navigation.open'),
      }}
    >
      <AppWorkspace.Primary header={<WorkspaceHeader title={t('specification.title')} />}>
        <AppContent>
          <AppWorkspaceBody className="py-6">
            <AppContentContainer align="start" size="standard" className="grid gap-6">
              <Link
                href={overviewHref}
                className="w-fit"
                onClick={(event) => {
                  if (
                    event.button === 0 &&
                    !event.metaKey &&
                    !event.ctrlKey &&
                    !event.shiftKey &&
                    !event.altKey
                  ) {
                    event.preventDefault();
                    onBack();
                  }
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <Icon name="arrow-right" size="sm" className="rotate-180" />
                  <span data-spec-back-label>{t('specification.backToSpecs')}</span>
                </span>
              </Link>
              <div className="grid min-w-0 gap-2">
                <Typography as="h2" variant="title-md">
                  {t('specification.placeholderTitle')}
                </Typography>
                <Typography variant="body-md" className="text-content-secondary">
                  {t('specification.placeholderDescription')}
                </Typography>
                <Typography
                  variant="body-sm"
                  className="text-content-muted [overflow-wrap:anywhere]"
                >
                  {t('specification.identity', { id: specId })}
                </Typography>
              </div>
            </AppContentContainer>
          </AppWorkspaceBody>
        </AppContent>
      </AppWorkspace.Primary>
    </AppWorkspace>
  );
}
