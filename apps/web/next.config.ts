import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

/**
 * Headers for every response. The portal's HTML records are shown in a
 * sandboxed iframe of their own, so nothing here needs to frame this site.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // Nothing here needs a device sensor; "Directions" hands off to a maps app.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@bhumi/core"],
  // The monorepo root, so tracing finds `@bhumi/core` and never mistakes a
  // lockfile further up the disk for this workspace.
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
