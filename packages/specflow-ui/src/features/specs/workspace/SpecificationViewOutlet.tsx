import { Alert } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import { useUiModules } from '../../../app/ui-modules/UiModulesProvider';
import {
  specificationViews,
  type SpecificationContextView,
  type SpecificationViewContext,
} from '../extensions/specificationViews';
import type { SpecificationSectionState } from './model';

/** Host owns the route-derived view ID, availability and rendering boundary. */
export function SpecificationViewOutlet({
  view,
  context,
}: {
  readonly view: SpecificationContextView;
  readonly context: SpecificationViewContext;
}) {
  const { t } = useTranslation();
  const registry = useUiModules();
  const viewComponent = registry
    .get(specificationViews)
    .find((candidate) => candidate.view === view);

  const availability: SpecificationSectionState | undefined =
    context.data.sectionAvailability?.[view];
  const unavailable = availability && availability !== 'available';
  if (unavailable || !viewComponent) {
    return (
      <Alert tone="attention" role="status" title={t('specification.unavailableTitle')}>
        {t('specification.unavailableDescription', { id: context.data.id })}
      </Alert>
    );
  }
  const View = viewComponent.Component;
  return <View {...context} />;
}
