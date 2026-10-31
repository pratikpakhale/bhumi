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
    // Chrome shows these in its install sheet; without them it offers a bare
    // "Install app?" box that reads like a bookmark. Nobody's land is named in them.
    screenshots: [
      { src: "/screenshots/phone-search.jpg", sizes: "824x1830", type: "image/jpeg", form_factor: "narrow", label: "Find a 7/12, 8A or Property Card" },
      { src: "/screenshots/phone-map.jpg", sizes: "824x1830", type: "image/jpeg", form_factor: "narrow", label: "Every survey number on a satellite map" },
      { src: "/screenshots/wide-map.jpg", sizes: "1920x1200", type: "image/jpeg", form_factor: "wide", label: "Survey numbers drawn over satellite imagery" },
    ],
    shortcuts: [
      { name: "Saved records", url: "/saved" },
      { name: "Map", url: "/map" },
      { name: "Account", url: "/account" },
    ],
  };
}
