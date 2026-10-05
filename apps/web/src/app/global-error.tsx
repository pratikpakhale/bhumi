"use client";

/**
 * The last resort: the root layout itself failed, so there is no stylesheet
 * and no app around this. Inline styles, plain words, one way out.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 560, margin: "0 auto", lineHeight: 1.5 }}>
        <h1 style={{ fontSize: 24 }}>Bhumi could not load</h1>
        <p>Something went wrong while starting the app. Your saved records are safe on this device.</p>
        <p>
          <button type="button" onClick={reset} style={{ fontSize: 16, padding: "10px 16px", marginRight: 12 }}>
            Try again
          </button>
          {/* A full page load on purpose: the app around this has failed. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/">Go to the start</a>
        </p>
      </body>
    </html>
  );
}
