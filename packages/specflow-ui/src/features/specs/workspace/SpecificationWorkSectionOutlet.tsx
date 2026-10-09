import { Component, type ReactNode } from 'react';
import { Alert } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { UiModuleRegistry } from '../../../app/ui-modules/registry';
import type {
  SpecificationWorkSectionContext,
  SpecificationWorkSectionContribution,
  SpecificationWorkSlot,
} from '../../../app/ui-modules/contracts';
import { useWorkspaceRuntime } from './WorkspaceContext';
import type { SpecificationWorkspaceData } from './model';

interface SectionBoundaryProps {
  readonly fallback: ReactNode;
  readonly children: ReactNode;
}

class SectionBoundary extends Component<SectionBoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function RegisteredWorkSection({
  contribution,
  context,
}: {
  readonly contribution: SpecificationWorkSectionContribution;
  readonly context: SpecificationWorkSectionContext;
}) {
  if (contribution.isVisible && !contribution.isVisible(context)) {
    return null;
  }

  return <div className="py-6">{contribution.render(context)}</div>;
}

export interface SpecificationWorkSectionOutletProps {
  readonly slot: SpecificationWorkSlot;
  readonly specId: string;
  readonly data: SpecificationWorkspaceData;
  readonly modules: UiModuleRegistry;
}

/** The Work host provides placement, not knowledge of the registered feature. */
export function SpecificationWorkSectionOutlet({
  slot,
  specId,
  data,
  modules,
}: SpecificationWorkSectionOutletProps) {
  const { t } = useTranslation();
  const actions = useWorkspaceRuntime();
  const context: SpecificationWorkSectionContext = { specId, data, actions };
  return (
    <>
      {modules.specificationWorkSections(slot).map((contribution) => (
        <SectionBoundary
          key={`${specId}:${contribution.id}`}
          fallback={
            <div className="py-6">
              <Alert role="alert" tone="attention" title={t('specification.unavailableTitle')}>
                {t('specification.unavailableDescription', { id: specId })}
              </Alert>
            </div>
          }
        >
          <RegisteredWorkSection contribution={contribution} context={context} />
        </SectionBoundary>
      ))}
    </>
  );
}
