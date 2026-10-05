import { ImageResponse } from "next/og";
import { MarkImage } from "@/lib/brand-image";

/**
 * Raster icons for the places that need PNG: the web app manifest, older
 * browsers and search results. Rendered once at build from the same mark.
 */
const ICONS = {
  "32.png": { size: 32, radius: 8, inset: 0 },
  "192.png": { size: 192, radius: 8, inset: 0 },
  "512.png": { size: 512, radius: 8, inset: 0 },
  // A launcher crops maskable icons to its own shape, so the square is full
  // bleed and the drawing sits inside the 80% safe zone.
  "maskable-512.png": { size: 512, radius: 0, inset: 0.1 },
} as const;

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(ICONS).map((file) => ({ file }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const icon = ICONS[file as keyof typeof ICONS];
  if (!icon) return new Response("Not found", { status: 404 });
  return new ImageResponse(<MarkImage size={icon.size} radius={icon.radius} inset={icon.inset} />, {
    width: icon.size,
    height: icon.size,
  });
}
