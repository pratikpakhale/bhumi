import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

export const alt = "Bhumi — 7/12, 8A and Property Card extracts from Mahabhulekh";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Inter at a given weight, fetched at build time. The renderer's built-in face
 * has one weight only. (Devanagari is left out on purpose: the renderer does
 * not shape conjuncts, so पत्रिका would print broken.)
 */
async function inter(weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${weight}`).then(
      (r) => r.text(),
    );
    const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    return src ? await fetch(src).then((r) => r.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

export default async function OpenGraphImage() {
  const [regular, bold] = await Promise.all([inter(400), inter(700)]);
  const fonts = [
    regular && { name: "Inter", data: regular, weight: 400 as const, style: "normal" as const },
    bold && { name: "Inter", data: bold, weight: 700 as const, style: "normal" as const },
  ].filter((f): f is NonNullable<typeof f> => !!f);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: SITE.paper,
          color: SITE.ink,
          fontFamily: "Inter",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 16,
              background: SITE.accent,
              color: SITE.paper,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 44,
              fontWeight: 700,
            }}
          >
            B
          </div>
          <div style={{ fontSize: 48, fontWeight: 700, letterSpacing: "-0.02em" }}>Bhumi</div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: "-0.035em",
            lineHeight: 1.08,
          }}
        >
          <div>7/12, 8A and Property Card</div>
          <div style={{ color: SITE.accent }}>in seconds.</div>
        </div>
        <div style={{ fontSize: 28, color: "#6b625a" }}>
          Maharashtra land records from Mahabhulekh · bhumi.pakhale.com
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
