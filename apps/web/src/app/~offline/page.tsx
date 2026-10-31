import type { Metadata } from "next";
import Link from "next/link";
import { Masthead, SiteFooter } from "@/components/Chrome";

export const metadata: Metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

/**
 * What the service worker shows for a screen this phone has never opened,
 * when there is no signal to fetch it. Saved records are the one thing that
 * works offline, so that is where it points.
 */
export default function Offline() {
  return (
    <div className="shell">
      <Masthead />
      <main className="gate">
        <h1 className="intro-title">No signal</h1>
        <p className="lede">This screen needs a connection. Your saved records still open, from the copies on this phone.</p>
        <div className="step-actions">
          <Link className="btn btn-primary" href="/saved">
            Saved records
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
