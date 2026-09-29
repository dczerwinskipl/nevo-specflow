import { findStable, mark } from '../core/figmaNodes';
import type { FigmaComponentDefinition, DesignSystemIR, DesignResources } from '../core/model';
import { configureComponent } from './componentSlots';
import { canonicalCaptures } from './componentLayout';
export async function upsertScreens(
  ir: DesignSystemIR,
  spec: FigmaComponentDefinition,
  section: SectionNode,
  resources: DesignResources,
  definitions: ReadonlyMap<string, FigmaComponentDefinition>,
  startY: number,
) {
  const captures = canonicalCaptures(spec, ir.components[spec.component] ?? []);
  if (!captures.size) throw new Error(`IR contains no ${spec.component} screen captures`);
  const frames: FrameNode[] = [];
  let y = startY;
  for (const [stableId, capture] of captures) {
    let frame = findStable<FrameNode>(stableId, ['FRAME']);
    if (!frame) {
      frame = figma.createFrame();
      mark(frame, stableId);
      section.appendChild(frame);
    }
    await configureComponent(frame, capture, spec, ir, resources, definitions);
    if (frame.parent !== section) section.appendChild(frame);
    frame.x = 24;
    frame.y = y;
    frames.push(frame);
    y += frame.height + 48;
  }
  return { frames, nextY: y };
}

