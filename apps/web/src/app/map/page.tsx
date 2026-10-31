import type { Metadata } from "next";
import { loadMapParams, mapHref } from "@/lib/map-params";
import { pageMetadata, plotImage } from "@/lib/page-metadata";
import { peekTree, placeNames } from "@/lib/tree";
import { Explorer } from "./explorer";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const ABOUT =
  "Maharashtra's village survey maps over satellite imagery. Tap a field to see its survey number and holders, and open its 7/12.";

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { district, taluka, village, plot } = await loadMapParams(searchParams);
  const names = await placeNames("7/12", district, taluka, village);
  const where = [names.village, names.taluka, names.district].filter(Boolean).join(", ");
  const everyView = { title: "Map", alternates: { canonical: "/map" } };

  if (district && taluka && village && plot) {
    return {
      ...pageMetadata({
        title: names.village ? `Survey ${plot}, ${names.village}` : `Survey ${plot}`,
        description: `Survey ${plot}${where ? ` in ${where}` : ""}, drawn on the village map over satellite imagery, with who holds it and its 7/12.`,
        url: mapHref({ district, taluka, village, plot }),
        image: plotImage({ district, taluka, village }, plot),
      }),
      ...everyView,
    };
  }
  if (district && taluka && (names.village || names.taluka)) {
    return {
      ...pageMetadata({
        title: `Map of ${names.village ?? names.taluka}`,
        description: `Survey numbers in ${where} over satellite imagery. Tap a field to see who holds it and open its 7/12.`,
        url: mapHref({ district, taluka, village }),
      }),
      ...everyView,
    };
  }
  return { ...pageMetadata({ title: "Map", description: ABOUT, url: "/map" }), ...everyView };
}

/** Server-rendered from the URL like the search page, so a shared link paints its place at once. */
export default async function Page({ searchParams }: Props) {
  const { district, taluka, village } = await loadMapParams(searchParams);
  const initial = await peekTree("7/12", district, taluka, village);

  return <Explorer initial={initial} />;
}
