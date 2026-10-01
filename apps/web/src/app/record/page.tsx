import { loadSearchParams } from "@/lib/search-params";
import { peekTree } from "@/lib/tree";
import { DocumentScreen } from "./document";

/**
 * The document view: a saved land opens *here*, on the record itself, not on a
 * filled-in search form.
 *
 * It takes the same params as the search page — the URL is still the whole
 * request — so the two screens are two readings of one address rather than two
 * states to keep in step.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { type, district, taluka, village } = await loadSearchParams(searchParams);
  const initial = await peekTree(type, district, taluka, village);

  return <DocumentScreen initial={initial} />;
}
