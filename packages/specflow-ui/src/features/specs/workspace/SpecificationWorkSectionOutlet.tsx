import { Component, type ReactNode } from 'react';
import { Alert, Button } from '@nevo/ui';
import { useTranslation } from 'react-i18next';
import type { UiRegistry } from '../../../app/ui-modules/registry';
import {
  specificationWorkSections,
  type SpecificationWorkSectionContext,
  type SpecificationWorkSectionContribution,
  type SpecificationWorkSlot,
} from '../extensions/specificationWorkSections';
import { useWorkspaceRuntime } from './WorkspaceContext';
import type { SpecificationWorkspaceData } from './model';

interface SectionBoundaryProps {
  readonly fallback: (retry: () => void, recovering: boolean) => ReactNode;
  readonly onRetry: () => void | Promise<void>;
  readonly children: ReactNode;
}

interface SectionBoundaryState {
  readonly failed: boolean;
  readonly recovering: boolean;
}

/**
 * Keep the failed contribution isolated until an explicit user retry or a new
 * resource/contribution identity. Background query updates never cause retry loops.
 */
export class SectionBoundary extends Component<SectionBoundaryProps, SectionBoundaryState> {
  override state: SectionBoundaryState = { failed: false, recovering: false };

  static getDerivedStateFromError(): Partial<SectionBoundaryState> {
    return { failed: true, recovering: false };
  }

  private readonly retry = () => {
    if (this.state.recovering) return;
    this.setState({ recovering: true });
    void Promise.resolve()
      .then(() => this.props.onRetry())
      .then(
        () => this.setState({ failed: false, recovering: false }),
        () => this.setState({ recovering: false }),
      );
  };

  override render() {
    return this.state.failed
      ? this.props.fallback(this.retry, this.state.recovering)
      : this.props.children;
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

  const Section = contribution.Component;
  return (
    <div className="py-6">
      <Section {...context} />
    </div>
  );
}

export interface SpecificationWorkSectionOutletProps {
  readonly slot: SpecificationWorkSlot;
  readonly specId: string;
  readonly data: SpecificationWorkspaceData;
  readonly modules: UiRegistry;
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
  const sections = modules
    .get(specificationWorkSections)
    .filter((contribution) => contribution.slot === slot);
  return (
    <>
      {sections.map((contribution) => (
        <SectionBoundary
          key={`${specId}:${contribution.id}`}
          onRetry={actions.refresh}
          fallback={(retry, recovering) => (
            <div className="grid gap-2 py-6">
              <Alert role="alert" tone="attention" title={t('specification.unavailableTitle')}>
                {t('specification.unavailableDescription', { id: specId })}
              </Alert>
              <div>
                <Button variant="secondary" size="sm" onClick={retry} disabled={recovering}>
                  {t(recovering ? 'common.retrying' : 'common.retry')}
                </Button>
              </div>
            </div>
          )}
        >
          <RegisteredWorkSection contribution={contribution} context={context} />
        </SectionBoundary>
      ))}
    </>
  );
}
