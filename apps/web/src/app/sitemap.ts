import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/** The two public pages. Records and the Saved list are personal, so not here. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: SITE.url, lastModified, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE.url}/map`, lastModified, changeFrequency: "monthly", priority: 0.8 },
  ];
}
