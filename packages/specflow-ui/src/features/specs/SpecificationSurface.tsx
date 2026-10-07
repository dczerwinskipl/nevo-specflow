import type {
  SpecificationScenario,
  SpecificationWorkspaceData,
  SpecificationWorkspaceView,
} from './workspace/model';
import { SpecificationWorkspace } from './workspace/SpecificationWorkspace';

export interface SpecificationSurfaceProps {
  readonly specId: string;
  readonly overviewHref?: string;
  readonly onBack?: () => void;
  readonly scenario?: SpecificationScenario;
  readonly initialView?: SpecificationWorkspaceView;
  readonly initialTask?: string;
  readonly data?: SpecificationWorkspaceData;
}

/** Specification workspace screen. */
export function SpecificationSurface(props: SpecificationSurfaceProps) {
  return <SpecificationWorkspace {...props} />;
}
