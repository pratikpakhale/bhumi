import type { Metadata } from "next";
import { SettingsScreen } from "./settings";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: true },
};

export default function Page() {
  return <SettingsScreen />;
}
