/** Expand the shortest decimal representation of a native finite number without
 * floating point multiplication, rounding or exponent notation. */
export function nativeDecimal(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Expected a finite nonnegative native measurement.');
  }

  const [mantissa, exponent] = String(value).split('e');
  if (exponent === undefined) {
    return mantissa!;
  }

  const [whole, fraction = ''] = mantissa!.split('.');
  const digits = whole! + fraction;
  const point = whole!.length + Number(exponent);
  if (point <= 0) {
    return '0.' + '0'.repeat(-point) + digits;
  }

  if (point >= digits.length) {
    return digits + '0'.repeat(point - digits.length);
  }

  return digits.slice(0, point) + '.' + digits.slice(point);
}
