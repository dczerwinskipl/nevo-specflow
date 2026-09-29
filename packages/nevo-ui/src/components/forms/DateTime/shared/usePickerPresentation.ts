import { useEffect, useState } from 'react';
import { compactViewportMediaQuery } from '../../../../design-system/responsive';

export type PickerPresentation = 'auto' | 'desktop' | 'mobile';
type ResolvedPickerPresentation = Exclude<PickerPresentation, 'auto'>;

function resolvePresentation(
  presentation: PickerPresentation,
  mediaMatches: boolean,
): ResolvedPickerPresentation {
  if (presentation !== 'auto') return presentation;
  return mediaMatches ? 'mobile' : 'desktop';
}

export function usePickerPresentation(
  requestedPresentation: PickerPresentation = 'auto',
): ResolvedPickerPresentation {
  const [presentation, setPresentation] = useState<ResolvedPickerPresentation>(() => {
    if (typeof window === 'undefined') return resolvePresentation(requestedPresentation, false);
    return resolvePresentation(
      requestedPresentation,
      window.matchMedia(compactViewportMediaQuery).matches,
    );
  });

  useEffect(() => {
    if (requestedPresentation !== 'auto') {
      setPresentation(requestedPresentation);
      return;
    }

    const media = window.matchMedia(compactViewportMediaQuery);
    const update = () => setPresentation(resolvePresentation('auto', media.matches));

    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [requestedPresentation]);

  return presentation;
}

