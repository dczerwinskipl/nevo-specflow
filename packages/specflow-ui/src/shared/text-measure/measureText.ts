/**
 * Measures text in the font an element renders with (family, size, weight and letter spacing), on
 * a canvas so measuring never lays out the page. Null where no 2D canvas exists (tests, very old
 * engines): the caller then falls back to a layout that needs no measurement (CSS clipping).
 */
export function textMeasurer(element: HTMLElement): ((text: string) => number) | null {
  const context = canvas().getContext('2d');
  if (!context) {
    return null;
  }

  const style = getComputedStyle(element);
  context.font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  if ('letterSpacing' in context) {
    context.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
  }

  return (text) => context.measureText(text).width;
}

let shared: HTMLCanvasElement | undefined;

function canvas() {
  shared ??= document.createElement('canvas');

  return shared;
}
