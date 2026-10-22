import type { CreatedSpec } from '@nevo/specflow-contracts/specs';
import { FeatureUnavailable } from '../../../app/errors/FeatureUnavailable';
import { CreateOperationPage } from './CreateOperationPage';
import { CreateFallback, CreateRuntimeGate } from './CreateRuntimeGate';

/**
 * The progress page of a Create exists only on a project Runtime (the demo flow has no operation
 * to follow); the Runtime mode decides, as it does for the form.
 */
export function CreateOperationScreen(props: {
  operationId: string;
  onOpen: (created: CreatedSpec) => void;
  onBackToForm: (restoreDraftOf?: string) => void;
  onBackToSpecifications: () => void;
}) {
  return (
    <CreateRuntimeGate>
      {(mode) =>
        mode === 'project' ? (
          // A different operation is a different page: nothing of the previous one carries over.
          <CreateOperationPage key={props.operationId} {...props} />
        ) : (
          <CreateFallback>
            <FeatureUnavailable onBack={props.onBackToSpecifications} />
          </CreateFallback>
        )
      }
    </CreateRuntimeGate>
  );
}
