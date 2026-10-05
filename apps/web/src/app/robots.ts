import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/**
 * Search and the map are the public pages. Record views are personal lookups
 * (and each costs a portal request), the Saved list is one device's, and the
 * API is not content.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/record", "/saved"] },
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
