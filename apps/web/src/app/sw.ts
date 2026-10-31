/// <reference lib="webworker" />
/**
 * The service worker: what lets an installed Bhumi open in a field with no
 * signal.
 *
 * The saved list and every record's last copy already live on the device
 * (localStorage and IndexedDB); what was missing offline was the app itself.
 * So the screens and their assets are kept here, and the network is still
 * asked first for every screen — a phone with signal always gets the current
 * deployment, and one without gets the last screen it had.
 *
 * Of the API, only reference data and the map are kept, because they change
 * over months. Everything else always goes to the network: the account and its
 * synced list, and the portal's live session (search, record), whose answers
 * depend on state the server holds. A stale one of those would be wrong rather
 * than merely old, and an allowlist keeps a route added later from being cached
 * by accident.
 */

import { defaultCache } from "@serwist/next/worker";
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
  type PrecacheEntry,
  type SerwistGlobalConfig,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const PAGES = "pages";
const DAY_S = 24 * 60 * 60;

/** Shown for a screen with no copy here and no signal to fetch it. */
const OFFLINE = "/~offline";

/** Screens; the record and search screens carry the whole request in their query. */
const SCREENS = ["/", "/saved", "/map", "/record", "/account", "/settings"];

/** Bhunaksha, through this server: the plot lookup (`/api/map?…`), outlines and tiles. */
const isMap = (pathname: string) => pathname === "/api/map" || pathname.startsWith("/api/map/");

const serwist: Serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ sameOrigin, url: { pathname } }) =>
        sameOrigin && pathname.startsWith("/api/") && pathname !== "/api/tree" && !isMap(pathname),
      handler: new NetworkOnly(),
    },
    {
      // Districts, talukas, villages: reference data that changes over months.
      matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname === "/api/tree",
      handler: new StaleWhileRevalidate({
        cacheName: "reference",
        plugins: [new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 30 * DAY_S })],
      }),
    },
    {
      // Bhunaksha's tiles and plot outlines change on the scale of years, and
      // the server already lets the CDN keep them for a month.
      matcher: ({ sameOrigin, url }) => sameOrigin && isMap(url.pathname),
      handler: new CacheFirst({
        cacheName: "map",
        plugins: [new ExpirationPlugin({ maxEntries: 1500, maxAgeSeconds: 30 * DAY_S, maxAgeFrom: "last-used" })],
      }),
    },
    {
      // A screen: the network first, briefly, then the copy kept here. A slow
      // connection is the usual one, so it is not waited on for long.
      matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: PAGES,
        networkTimeoutSeconds: 4,
        plugins: [
          new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * DAY_S }),
          // Serwist's own `fallbacks` skip a strategy with an error handler,
          // so the offline screen is this one's last resort too.
          {
            handlerDidError: async ({ request }): Promise<Response | undefined> =>
              (await sameScreen(new URL(request.url))) ?? serwist.matchPrecache(OFFLINE),
          },
        ],
      }),
    },
    ...defaultCache,
  ],
});

/**
 * With no signal and no copy of this exact address (a saved record whose page
 * this phone never loaded whole), the bare screen kept at install. The screen
 * reads its request from the address bar once it runs, so it still shows the
 * right record, from the device's own copy. The bare one is used rather than
 * another address's page: it belongs to the current deployment, and its title
 * does not name somebody else's land.
 */
async function sameScreen(url: URL): Promise<Response | undefined> {
  if (!SCREENS.includes(url.pathname)) return undefined;
  return (
    (await serwist.matchPrecache(url.pathname)) ??
    (await (await caches.open(PAGES)).match(url.pathname, { ignoreSearch: true, ignoreVary: true }))
  );
}

serwist.addEventListeners();
