/**
 * How the reader last acted: with the keyboard or with a pointer (mouse, touch, pen). A heading that
 * receives focus from a script keeps the focus ring after keyboard use and drops it after a pointer,
 * where a thick outline around a whole heading only gets in the way.
 */
let keyboard = false;
let listening = false;

function listen() {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  document.addEventListener('keydown', () => (keyboard = true), true);
  document.addEventListener('pointerdown', () => (keyboard = false), true);
}

export function lastInputWasKeyboard(): boolean {
  listen();
  return keyboard;
}

// Listening starts when the module loads, so the first answer is not a guess.
listen();
