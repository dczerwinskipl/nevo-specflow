import type { ReactNode, Ref } from 'react';
import { Typography } from '@nevo/ui';

/**
 * The top of a Create form, shared by both flows: what leads in (the location line or the way back
 * to the method choice), then the page heading that takes focus once the form is shown, and a
 * short subheading.
 */
export function CreateFormHeader({
  lead,
  heading,
  subheading,
  headingRef,
}: {
  lead: ReactNode;
  heading: string;
  subheading: string;
  headingRef: Ref<HTMLHeadingElement>;
}) {
  return (
    <div className="grid gap-6">
      {lead}
      <header className="grid gap-2">
        <Typography
          as="h1"
          variant="title-lg"
          ref={headingRef}
          tabIndex={-1}
          className="outline-none"
        >
          {heading}
        </Typography>
        <Typography as="p" variant="body-md" className="text-content-secondary">
          {subheading}
        </Typography>
      </header>
    </div>
  );
}
