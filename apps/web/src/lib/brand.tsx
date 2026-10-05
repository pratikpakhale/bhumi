/**
 * The mark, in one place.
 *
 * A village map in miniature: one survey plot, divided, with the share that is
 * yours picked out — which is what every lookup here ends in. Ink blue for the
 * register, paper for the lines, and a single saffron field. Geometry only, so
 * it is drawn identically by the browser, by the favicon route and by the
 * image renderer behind the PWA icons and the social card.
 */

export const BRAND = {
  /** `--accent` (light). The register's ink. */
  ink: "#0158b2",
  /** `--bg` (light). */
  paper: "#f9f7f3",
  /** `--text` (light). */
  text: "#211d18",
  /** `--bg` (dark). */
  night: "#15120f",
  /** The one saffron field. Used in the mark and nowhere in the interface. */
  seal: "#f4a437",
} as const;

/** The plot outline and the line that divides it, on a 32-unit square. */
const PLOT = "M7 23.5 9.5 8.5 24 7.5 25.5 22.5Z";
const SHARE = "M16.75 8 24 7.5 25.5 22.5 16.25 23Z";
const DIVIDE = "M16.75 8 16.25 23";

/**
 * The mark as SVG markup. `inset` shrinks the drawing inside its square, for
 * maskable icons whose outer ring a launcher may crop.
 */
export function markSvg({ size = 32, radius = 8, inset = 0 }: { size?: number; radius?: number; inset?: number } = {}): string {
  const scale = 1 - inset * 2;
  const shift = 16 * inset * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">`
    + `<rect width="32" height="32" rx="${radius}" fill="${BRAND.ink}"/>`
    + `<g transform="translate(${shift} ${shift}) scale(${scale})">`
    + `<path d="${SHARE}" fill="${BRAND.seal}"/>`
    + `<path d="${PLOT}" fill="none" stroke="${BRAND.paper}" stroke-width="2.2" stroke-linejoin="round"/>`
    + `<path d="${DIVIDE}" stroke="${BRAND.paper}" stroke-width="2.2" stroke-linecap="round"/>`
    + `</g></svg>`;
}

/** The mark as a React element, for the masthead. Decorative: the wordmark names it. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="mark">
      <rect width="32" height="32" rx="8" fill={BRAND.ink} />
      <path d={SHARE} fill={BRAND.seal} />
      <path d={PLOT} fill="none" stroke={BRAND.paper} strokeWidth="2.2" strokeLinejoin="round" />
      <path d={DIVIDE} stroke={BRAND.paper} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
