import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";
import { CARD_SIZE, Card, cardFonts } from "@/lib/brand-image";

export const alt = "Bhumi — Maharashtra's 7/12, 8A and Property Card, and every survey number on a map";
export const size = CARD_SIZE;
export const contentType = "image/png";

const FIELD_CORNERS = [
  [[0, 0], [150, 0], [290, 0], [400, 0]],
  [[0, 128], [138, 118], [300, 126], [400, 112]],
  [[0, 262], [160, 248], [276, 256], [400, 244]],
  [[0, 380], [150, 380], [296, 380], [400, 380]],
] as const;

const fields = FIELD_CORNERS.slice(0, -1).flatMap((row, r) =>
  row.slice(0, -1).map((a, c) => [a, row[c + 1], FIELD_CORNERS[r + 1][c + 1], FIELD_CORNERS[r + 1][c]]),
);
const path = (pts: readonly (readonly [number, number])[]) => `M${pts.map(([x, y]) => `${x} ${y}`).join("L")}Z`;

function Village() {
  const [a, b, c, d] = fields[4];
  const top = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
  const bottom = [(c[0] + d[0]) / 2, (c[1] + d[1]) / 2] as const;
  return (
    <svg width="400" height="380" viewBox="-4 -4 408 388">
      {fields.map((f, i) => (
        <path key={i} d={path(f)} fill="none" stroke={BRAND.line} strokeWidth="3" strokeLinejoin="round" />
      ))}
      <path d={path([top, b, c, bottom])} fill={BRAND.seal} />
      <path d={path([a, b, c, d])} fill="none" stroke={BRAND.ink} strokeWidth="6" strokeLinejoin="round" />
      <path d={path([top, bottom])} stroke={BRAND.ink} strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", width: 620, gap: 28 }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                fontSize: 76,
                fontWeight: 700,
                letterSpacing: "-0.035em",
                lineHeight: 1.04,
              }}
            >
              <div>Land records,</div>
              <div style={{ color: BRAND.ink }}>and the land.</div>
            </div>
            <div style={{ fontSize: 30, lineHeight: 1.35, color: BRAND.text2 }}>
              7/12, 8A and Property Card from Mahabhulekh in seconds, and every survey number on a satellite map.
            </div>
          </div>
          <Village />
        </div>
      </Card>
    ),
    { ...size, fonts: await cardFonts() },
  );
}
