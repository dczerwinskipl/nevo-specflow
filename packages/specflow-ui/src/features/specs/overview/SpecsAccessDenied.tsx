import { useTranslation } from 'react-i18next';
import {
  SpecFlowStandaloneShell,
  StandaloneScreenHeader,
} from '../../../app/StandaloneScreenLayout';

export function SpecsAccessDenied() {
  const { t } = useTranslation();
  return (
    <SpecFlowStandaloneShell>
      <div role="alert" className="grid w-full gap-8">
        <StandaloneScreenHeader
          title={t('specifications.forbidden.title')}
          description={t('specifications.forbidden.description')}
        />
      </div>
    </SpecFlowStandaloneShell>
  );
}
