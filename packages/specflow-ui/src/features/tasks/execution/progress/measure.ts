/**
 * The widest a Now progress block (`StepProgress` and `TaskProgress`, `block`) grows: its label line
 * and full-width bar stop at the Specifications list's Workflow column maximum (22rem, the
 * `specification` preset of `CollectionColumns`), so the Now and a list row draw their bars at the
 * same width on every screen and a wide Overview never stretches them. Keep the two in step.
 */
export const progressBlockMeasure = 'w-full max-w-[22rem]';
