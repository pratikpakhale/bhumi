import { markSvg } from "@/lib/brand";

export const dynamic = "force-static";

/** The favicon, as a vector — crisp on every screen, and the mark's single source. */
export function GET() {
  return new Response(markSvg(), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400, s-maxage=31536000",
    },
  });
}
