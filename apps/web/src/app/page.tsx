import { loadSearchParams } from "@/lib/search-params";
import { peekTree } from "@/lib/tree";
import { Home } from "./home";

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

  return <Home initial={initial} />;
}
