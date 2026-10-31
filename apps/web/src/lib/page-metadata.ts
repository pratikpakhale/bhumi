import type { Metadata } from "next";
import { CARD_SIZE } from "./brand-image";
import { SITE } from "./site";

/**
 * A page's `openGraph` replaces the layout's whole, so the site-wide fields are
 * restated here, the site's card included when a page has no image of its own.
 */
export function pageMetadata({
  title,
  description,
  url,
  image,
}: {
  title: string;
  description: string;
  url: string;
  image?: string;
}): Metadata {
  const shared = `${title} · ${SITE.name}`;
  const images = [{ url: image ?? "/opengraph-image", ...CARD_SIZE, alt: title }];
  return {
    title,
    description,
    openGraph: {
      type: "website",
      url,
      siteName: SITE.name,
      title: shared,
      description,
      locale: "en_IN",
      alternateLocale: ["mr_IN"],
      images,
    },
    twitter: { card: "summary_large_image", title: shared, description, images },
  };
}

export const plotImage = (place: { district: string; taluka: string; village: string }, survey: string) =>
  `/api/og/plot?${new URLSearchParams({ ...place, survey })}`;
