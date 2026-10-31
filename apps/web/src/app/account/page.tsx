import type { Metadata } from "next";
import { accountsConfigured } from "@/lib/accounts";
import { AccountScreen } from "./account";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: true },
};

export default function Page() {
  return <AccountScreen available={accountsConfigured()} />;
}
