import type { Metadata } from "next";
import { pageMetadata, plotImage } from "@/lib/page-metadata";
import { RECORD_LABELS, loadSearchParams } from "@/lib/search-params";
import { peekTree, placeNames } from "@/lib/tree";
import { DocumentScreen } from "./document";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const raw = await searchParams;
  const { type, district, taluka, village, parcel, q } = await loadSearchParams(raw);
  const names = await placeNames(type, district, taluka, village);
  const where = [names.village, names.taluka, names.district].filter(Boolean).join(", ");
  const label = RECORD_LABELS[type];
  const number = type === "KJP" ? q && `measurement ${q}` : parcel && { "7/12": "survey", "8A": "khata", PropertyCard: "CTS" }[type] + ` ${parcel}`;
  const query = new URLSearchParams(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string"));

  return {
    ...pageMetadata({
      title: [`${label}${number ? ` of ${number}` : ""}`, names.village].filter(Boolean).join(", "),
      description: `The ${label} extract${number ? ` for ${number}` : ""}${where ? ` in ${where}` : ""}, from Mahabhulekh.`,
      url: `/record?${query}`,
      image: type === "7/12" && district && taluka && village && parcel ? plotImage({ district, taluka, village }, parcel) : undefined,
    }),
    robots: { index: false, follow: true },
  };
}

/**
 * The document view: a saved land opens *here*, on the record itself, not on a
 * filled-in search form.
 *
 * It takes the same params as the search page — the URL is still the whole
 * request — so the two screens are two readings of one address rather than two
 * states to keep in step.
 */
export default async function Page({ searchParams }: Props) {
  const { type, district, taluka, village } = await loadSearchParams(searchParams);
  const initial = await peekTree(type, district, taluka, village);

  return <DocumentScreen initial={initial} />;
}
