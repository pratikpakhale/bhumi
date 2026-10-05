"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Masthead, SiteFooter } from "@/components/Chrome";

/** A screen that threw while rendering. The masthead still works, so there is always a way on. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="shell">
      <Masthead />
      <main className="gate">
        <h1 className="intro-title">Something went wrong</h1>
        <p className="lede">This screen hit a problem it could not recover from. Your saved records are safe.</p>
        <div className="step-actions">
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <Link className="btn btn-ghost" href="/">
            Start a new search
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
