import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BRAND, markSvg } from "./brand";
import { SITE } from "./site";

/** The mark for `ImageResponse`, which renders an `<img>` of SVG reliably. Server only. */
export function MarkImage({ size, radius = 8, inset = 0 }: { size: number; radius?: number; inset?: number }) {
  const src = `data:image/svg+xml;base64,${Buffer.from(markSvg({ size, radius, inset })).toString("base64")}`;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt="" />;
}

export const CARD_SIZE = { width: 1200, height: 630 };

/**
 * The renderer's built-in face has one weight only. (Devanagari is left out on
 * purpose: the renderer does not shape conjuncts, so पत्रिका would print broken.)
 */
async function inter(weight: 400 | 700) {
  const file = join(process.cwd(), "node_modules/@fontsource/inter/files", `inter-latin-${weight}-normal.woff`);
  const buf = await readFile(file).catch(() => null);
  return buf && { name: "Inter", data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, weight, style: "normal" as const };
}

export async function cardFonts() {
  return (await Promise.all([inter(400), inter(700)])).filter((f) => f !== null);
}

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: BRAND.paper,
        color: BRAND.text,
        fontFamily: "Inter",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <MarkImage size={64} />
        <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.02em" }}>{SITE.name}</div>
      </div>
      {children}
      <div style={{ display: "flex", fontSize: 26, color: BRAND.text2 }}>{new URL(SITE.url).host}</div>
    </div>
  );
}
