import type { Metadata } from "next";
import { SavedScreen } from "./saved";

/** A list kept on one device: nothing here for a search engine. */
export const metadata: Metadata = {
  title: "Saved records",
  robots: { index: false, follow: true },
};

export default function Page() {
  return <SavedScreen />;
}
