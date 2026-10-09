import { useCallback, useState } from 'react';
import type { SpecificationWorkspaceView } from './model';

export interface UseSpecificationViewNavigationOptions {
  readonly initialView?: SpecificationWorkspaceView;
  readonly onNavigateView?: (target: { view: SpecificationWorkspaceView }) => void;
}

export interface UseSpecificationViewNavigationResult {
  readonly currentView: SpecificationWorkspaceView;
  readonly navigateToView: (view: SpecificationWorkspaceView) => void;
  readonly handleViewChange: (view: SpecificationWorkspaceView) => void;
}

/** Only Specification-local views live here; Full Task is a separate routed page. */
export function useSpecificationViewNavigation({
  initialView = 'work',
  onNavigateView,
}: UseSpecificationViewNavigationOptions): UseSpecificationViewNavigationResult {
  const [uncontrolledView, setUncontrolledView] = useState<SpecificationWorkspaceView>(initialView);
  const currentView = onNavigateView ? initialView : uncontrolledView;

  const navigateToView = useCallback(
    (view: SpecificationWorkspaceView) => {
      if (onNavigateView) {
        onNavigateView({ view });
      } else {
        setUncontrolledView(view);
      }
    },
    [onNavigateView],
  );

  return { currentView, navigateToView, handleViewChange: navigateToView };
}
