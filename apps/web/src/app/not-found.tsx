import Link from "next/link";
import { Masthead, SiteFooter } from "@/components/Chrome";

export default function NotFound() {
  return (
    <div className="shell">
      <Masthead />
      <main className="gate">
        <h1 className="intro-title">Page not found</h1>
        <p className="lede">The link may be incomplete. Records are found from the search page.</p>
        <div className="step-actions">
          <Link className="btn btn-primary" href="/">
            Search land records
          </Link>
          <Link className="btn btn-ghost" href="/saved">
            Saved records
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
