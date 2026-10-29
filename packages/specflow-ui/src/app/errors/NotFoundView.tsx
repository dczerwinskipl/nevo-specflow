import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@nevo/ui';
import { SpecFlowStandaloneShell, StandaloneScreenHeader } from '../StandaloneScreenLayout';

/** Not-found component of the router: an address that leads nowhere in the product. */
export function NotFoundView() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <SpecFlowStandaloneShell>
      <div className="grid w-full gap-8">
        <StandaloneScreenHeader
          title={t('notFound.title')}
          description={t('notFound.description')}
        />
        <div>
          <Button
            variant="secondary"
            onClick={() => void navigate({ to: '/', search: { collection: 'current' } })}
          >
            {t('notFound.back')}
          </Button>
        </div>
      </div>
    </SpecFlowStandaloneShell>
  );
}
