import {
  Button,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@nevo/ui';

/**
 * A section's add action once it has rows: the WorkspaceHeader icon action (ghost `sm`
 * `IconButton`, named by its label, the same label as tooltip).
 */
export function SectionAddButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton icon="plus" size="sm" variant="ghost" aria-label={label} onClick={onPress} />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** An empty section's one call to action: a labelled button, replaced by `+` once rows exist. */
export function SectionCallToAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <div>
      <Button size="sm" variant="secondary" onClick={onPress}>
        {label}
      </Button>
    </div>
  );
}
