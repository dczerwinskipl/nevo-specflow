import { useTranslation } from 'react-i18next';

/** The dark modules of a QR code, row by row. */
export type QrModules = readonly (readonly boolean[])[];

/**
 * Encodes `text` as a QR code. BLOCKED on an approved dependency: replace the body with the
 * encoder of an established library (the plan names `uqr`: `encode(text, { ecc: 'M', border: 0 })`
 * returns the module matrix as `data`). It is deliberately not hand-rolled: a code that does not
 * scan fails silently. Until then the QR tab says that it is unavailable.
 */
export function encodeQrModules(_text: string): QrModules {
  throw new Error('No QR encoder is installed.');
}

/** `modules` of `text`, or undefined when it cannot be encoded. */
export function tryEncodeQr(
  text: string,
  encode: (text: string) => QrModules = encodeQrModules,
): QrModules | undefined {
  try {
    return encode(text);
  } catch {
    return undefined;
  }
}

/** A QR code as SVG: dark modules on a white quiet zone, whatever the theme. */
export function QrCodeImage({
  modules,
  size = 184,
}: {
  readonly modules: QrModules;
  readonly size?: number;
}) {
  const { t } = useTranslation();
  const count = modules.length;
  const quiet = 2;
  const extent = count + 2 * quiet;

  return (
    <svg
      role="img"
      aria-label={t('pairing.dialog.qrLabel')}
      width={size}
      height={size}
      viewBox={`${String(-quiet)} ${String(-quiet)} ${String(extent)} ${String(extent)}`}
      className="rounded-control bg-white"
      fill="black"
      shapeRendering="crispEdges"
    >
      {modules.flatMap((row, y) =>
        row.map((dark, x) =>
          dark ? <rect key={`${String(x)}-${String(y)}`} x={x} y={y} width={1} height={1} /> : null,
        ),
      )}
    </svg>
  );
}
