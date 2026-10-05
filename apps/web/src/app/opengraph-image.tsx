import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";
import { SITE } from "@/lib/site";
import { MarkImage } from "@/lib/brand-image";

export const alt = "Bhumi — 7/12, 8A and Property Card extracts from Mahabhulekh";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Inter from the installed `@fontsource/inter`, read at build time — no
 * network, so the card renders the same offline and in CI. The renderer's
 * built-in face has one weight only. (Devanagari is left out on purpose: the
 * renderer does not shape conjuncts, so पत्रिका would print broken.)
 */
async function inter(weight: 400 | 700): Promise<ArrayBuffer | null> {
  try {
    const file = join(process.cwd(), "node_modules/@fontsource/inter/files", `inter-latin-${weight}-normal.woff`);
    const buf = await readFile(file);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
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
          background: BRAND.paper,
          color: BRAND.text,
          fontFamily: "Inter",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <MarkImage size={80} />
          <div style={{ fontSize: 52, fontWeight: 700, letterSpacing: "-0.02em" }}>Bhumi</div>
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
          <div style={{ color: BRAND.ink }}>in seconds, on any phone.</div>
        </div>
        <div style={{ fontSize: 28, color: "#6b6258" }}>
          {`Maharashtra land records from Mahabhulekh · ${new URL(SITE.url).host}`}
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
