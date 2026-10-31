import type { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";
import { CARD_SIZE, Card, cardFonts } from "@/lib/brand-image";
import { readPlace } from "@/lib/api";
import { formatArea, outlinePath } from "@/lib/geo";
import { getParcelMap } from "@/lib/parcel-map";

const DRAWING = 440;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const plot = await (async () => {
    const { district, taluka, village } = readPlace(p, true);
    const survey = p.get("survey")?.trim();
    return survey ? (await getParcelMap(district, taluka, village, survey)).plot : null;
  })().catch(() => null);

  if (!plot) return Response.redirect(new URL("/opengraph-image", req.url), 302);

  return new ImageResponse(
    (
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", width: 560, gap: 20 }}>
            <div style={{ fontSize: 30, color: BRAND.text2 }}>Survey number</div>
            <div style={{ fontSize: 112, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1 }}>{plot.number}</div>
            <div style={{ fontSize: 34, color: BRAND.text }}>{formatArea(plot.areaSqm)}</div>
            <div style={{ fontSize: 26, lineHeight: 1.4, color: BRAND.text2 }}>
              The plot as drawn on the village map, with its holders and 7/12.
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: DRAWING,
              height: DRAWING,
              borderRadius: 28,
              background: BRAND.sunken,
            }}
          >
            <svg width={DRAWING - 96} height={DRAWING - 96} viewBox={`-6 -6 ${DRAWING - 84} ${DRAWING - 84}`}>
              <path
                d={outlinePath(plot.geometry, plot.bounds, DRAWING - 96, DRAWING - 96)}
                fill={BRAND.ink}
                fillOpacity="0.14"
                fillRule="evenodd"
                stroke={BRAND.ink}
                strokeWidth="6"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </Card>
    ),
    {
      ...CARD_SIZE,
      fonts: await cardFonts(),
      headers: { "Cache-Control": "public, s-maxage=2592000, stale-while-revalidate=2592000" },
    },
  );
}
