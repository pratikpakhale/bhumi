import { loadSearchParams } from "@/lib/search-params";
import { peekTree } from "@/lib/tree";
import { SITE } from "@/lib/site";
import { Home } from "./home";

/** What the site is, for search engines: a free web app over public records. */
const STRUCTURED = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    applicationCategory: "ReferenceApplication",
    operatingSystem: "Any",
    inLanguage: ["en-IN", "mr-IN"],
    areaServed: { "@type": "State", name: "Maharashtra" },
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.url,
  },
];

/**
 * The page is server-rendered from the URL.
 *
 * The selection already lives in the query string and the reference data
 * already lives in a server-side cache, so the shell — and, for a warm cache,
 * the populated dropdowns — can be real HTML instead of something the browser
 * has to fetch after hydrating. {@link peekTree} never blocks on the portal, so
 * this costs no latency when the cache is cold; the client just fills in.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { type, district, taluka, village } = await loadSearchParams(searchParams);
  const initial = await peekTree(type, district, taluka, village);

  return (
    <>
      <script
        type="application/ld+json"
        // `<` escaped so no string in the data can close the script element.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED).replace(/</g, "\\u003c") }}
      />
      <Home initial={initial} />
    </>
  );
}
