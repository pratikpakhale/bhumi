import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

/**
 * The service worker (src/app/sw.ts) is what makes Bhumi an app on a phone: it
 * keeps the screens themselves, so an installed Bhumi opens with no signal and
 * the saved copies on the device have somewhere to be shown. Built with the
 * production bundle only; in development it would serve stale code.
 *
 * The screens are precached as pages, not just assets, so the first
 * offline launch works even for a screen this device has never opened. They
 * are server-rendered, so their revision is the deployment's commit.
 */
const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? randomUUID();
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV !== "production",
  additionalPrecacheEntries: ["/", "/saved", "/map", "/record", "/account", "/settings", "/~offline"].map((url) => ({ url, revision })),
});

/**
 * Headers for every response. The portal's HTML records are shown in a
 * sandboxed iframe of their own, so nothing here needs to frame this site.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@bhumi/core"],
  // The monorepo root, so tracing finds `@bhumi/core` and never mistakes a
  // lockfile further up the disk for this workspace.
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  // The plot card reads its font from disk at request time; tracing cannot see a computed path.
  outputFileTracingIncludes: {
    "/api/og/plot": ["./node_modules/@fontsource/inter/files/inter-latin-{400,700}-normal.woff"],
  },
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // The worker decides what every visit gets; a stale copy of it must never be served.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

export default withSerwist(nextConfig);
