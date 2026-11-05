import { RailTail, Typography } from '@nevo/ui';

/**
 * The Secondary's header while no document is open: the same 36px rail band the open documents'
 * tab strip uses, so the first document opening does not change the header's height.
 */
export function DocumentsIdleRailHeader({ title }: { title: string }) {
  return (
    <RailTail className="h-tab-rail w-full px-3">
      <Typography as="h2" variant="body-md" className="truncate text-content-secondary">
        {title}
      </Typography>
    </RailTail>
  );
}
