/**
 * Serve MapLibre's worker from `public/`.
 *
 * MapLibre 6 starts its renderer worker from a URL rather than through the
 * bundler, and the worker imports a shared chunk as a sibling file — so the two
 * have to be served side by side under their own names, which webpack will not
 * do. This copies them into `public/maplibre/<version>/`; the version in the
 * path is what `MapCanvas` points `setWorkerUrl` at, and makes every upgrade a
 * new URL rather than a stale cached one.
 */

import { cp, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pkgPath = require.resolve("maplibre-gl/package.json");
const { version } = JSON.parse(await readFile(pkgPath, "utf8"));
const dist = join(dirname(pkgPath), "dist");
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "maplibre", version);

await mkdir(out, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await cp(join(dist, file), join(out, file));
}
