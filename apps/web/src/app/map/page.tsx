import type { Metadata } from "next";
import { loadMapParams } from "@/lib/map-params";
import { peekTree } from "@/lib/tree";
import { Explorer } from "./explorer";

export const metadata: Metadata = {
  title: "Map",
  description:
    "Maharashtra's village survey maps over satellite imagery. Tap a field to see its survey number and holders, and open its 7/12.",
  alternates: { canonical: "/map" },
};

/** Server-rendered from the URL like the search page, so a shared link paints its place at once. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { district, taluka, village } = await loadMapParams(searchParams);
  const initial = await peekTree("7/12", district, taluka, village);

  return <Explorer initial={initial} />;
}
