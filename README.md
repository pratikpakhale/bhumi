# Bhumi

A faster, cleaner client for Maharashtra's **Mahabhulekh** land-record portal
([bhulekh.mahabhumi.gov.in](https://bhulekh.mahabhumi.gov.in/)).

The official site is an ASP.NET WebForms app: every dropdown is a full-page
postback, the UI is heavy, and the record is gated behind a captcha. Bhumi wraps
that flow in a typed library and a fast single-page UI, so a lookup is:

**record type → district → taluka → village → parcel → record**

…with type-to-filter dropdowns, session reuse, and no page reloads.

## What it covers

| Record type | Marathi | Search by | Returned as |
| --- | --- | --- | --- |
| 7/12 extract | सातबारा | survey / gat number | JPEG image |
| 8A extract | गाव नमुना ८अ | khata number | HTML table |
| Property Card | मिळकत पत्रिका | CTS / न.भू. number | JPEG image |
| Kami-Jasti-Patrak | कमी जास्त पत्रक | measurement (mojani) number | HTML / image |

A 7/12 also shows where its parcel lies: the plot outline from the state's
cadastral map, **Mahabhunakasha** ([mahabhunakasha.mahabhumi.gov.in](https://mahabhunakasha.mahabhumi.gov.in/27/index.html)),
over satellite imagery, with its mapped area and directions. That works only for
villages whose map Bhunaksha has georeferenced.

`/map` turns that around: pick a taluka and every mapped village in it is laid
over the imagery. Tapping a field names its survey number and the khatas holding
each sub-division, with links to their 7/12s and 8As, and taps across a village
line find the neighbouring village's field.

Records can be saved on the device, with no account: `/saved` lists them,
renames, reorders, groups by village, and shares the whole list as one link or
file. Each record keeps its last fetched copy so it opens offline, and the
places used most rise to the top of every dropdown.

7/12 and 8A are verified end-to-end against the live portal. Property Card uses
the same image path as 7/12; KJP's cascade is verified but its final fetch needs
a real measurement number to confirm the exact result container.

## Layout

```
packages/core   @bhumi/core — framework-free TypeScript client
  index.ts        browser-safe entry: types, errors, pure parsers
  server.ts       @bhumi/core/server — the network clients (Node only)
  tls.ts          portal HTTPS that rides out a lapsed government certificate
  session.ts      cookies + __VIEWSTATE postback plumbing
  viewstate.ts    reads the captcha answer out of the ViewState
  client.ts       the stateful cascade + record fetch
  html.ts         WebForms-specific scraping helpers
  bhunaksha.ts    the cadastral map: village extents, plot outlines, WMS tiles
  map.ts          map types and survey-number matching, shared with the browser
apps/web        Next.js app
  api/*           route handlers over a per-browser session store
  app/page.tsx    the search UI
  app/record/*    the document view
  app/saved/*     saved records and on-device data
  app/map/*       the map explorer
  lib/brand.tsx   the mark, drawn once for the UI, icons and social card
```

The web app keeps one live `MahabhulekhClient` per browser (keyed by an httpOnly
cookie) so the cascade stays on a single ASP.NET session instead of re-walking
it on every step.

## Develop

```bash
pnpm install
pnpm dev          # Next.js on http://localhost:3000
pnpm build        # build core + web
pnpm typecheck    # needs core built first: web reads its dist
pnpm lint
pnpm test
```

`.github/workflows/ci.yml` runs the same checks on every push and pull request.

## On the captcha

The portal renders a visual captcha, but it stores the **expected answer in
plaintext inside the page's `__VIEWSTATE`** (a `viewCaptcha` StateBag entry).
Because ViewState MAC validation is disabled, any client can read that value and
answer the captcha without ever seeing the image — which is exactly what
`viewstate.ts` does. The captcha therefore provides no protection against
automation; it only inconveniences human users.

This is a weakness in the portal, not something this client introduces. It is
worth reporting to NIC (encrypt/MAC the ViewState, or validate the captcha
server-side against session state rather than round-tripping the answer to the
client).

## Note on use

Records are fetched live and are watermarked "view only — not for legal purpose"
by the portal itself. For anything legal, obtain the official
digitally-signed copy from the government's own channels. Be considerate of a
shared public service: this is a client for occasional lookups, not bulk
scraping.
