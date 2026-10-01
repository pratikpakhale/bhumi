import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/**
 * The search page is the one public page. Record views are personal lookups
 * (and each costs a portal request), and the API is not content.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/record"] },
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
