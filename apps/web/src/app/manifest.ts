import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";
import { SITE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Bhumi — Maharashtra land records",
    short_name: SITE.name,
    description: SITE.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: BRAND.paper,
    theme_color: BRAND.paper,
    lang: "en-IN",
    categories: ["utilities", "reference"],
    icons: [
      { src: "/mark.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Saved records", url: "/saved" },
      { name: "Map", url: "/map" },
    ],
  };
}
