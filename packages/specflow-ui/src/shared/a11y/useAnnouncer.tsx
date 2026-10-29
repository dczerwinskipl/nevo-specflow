import { useCallback, useState } from 'react';

/**
 * One polite live region per screen. The owner calls `announce` for results that have no visible
 * change of their own (copied, refreshed, a suggestion applied) and renders `region` once; the
 * region is always mounted, so screen readers pick up each change of its text.
 */
export function useAnnouncer(): {
  announce: (message: string) => void;
  region: React.ReactElement;
} {
  const [message, setMessage] = useState('');
  const announce = useCallback((next: string) => setMessage(next), []);

  return {
    announce,
    region: (
      <p role="status" className="sr-only">
        {message}
      </p>
    ),
  };
}
