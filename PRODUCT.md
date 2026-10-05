# Product

## Register

product

## Users

Two audiences, one screen.

- **Primary — the occasional lookup, on a phone.** A landowner, buyer, farmer or
  family member checking a 7/12 or 8A before a sale, a loan, a partition or an
  argument. Often outdoors, in daylight, on a mid-range Android with patchy
  data. They do this a few times a year, know exactly which village they want,
  and have never heard the words "cascade" or "ViewState". Village and occupant
  names are in Devanagari; the rest of the interface is in English.
- **Secondary — the repeat professional, at a desk.** A broker, advocate,
  talathi-adjacent clerk or surveyor pulling several records in a sitting. They
  want keyboard flow, type-to-filter, and no ceremony between them and the next
  record.

Design mobile-first and let the desktop layout be genuinely good, not merely
wider.

## Product Purpose

Mahabhulekh already publishes this data. It publishes it through an ASP.NET
WebForms app where every dropdown is a full-page postback and the record sits
behind a captcha. Bhumi is a faster client for the same public data: one page,
no reloads, type-to-filter dropdowns, a warm session, and the record in hand.

Success is a single number: **time from landing to record on screen.** Every
design decision is measured against it. A secondary success condition is that a
first-time user never has to guess what comes next.

## Brand Personality

Precise, plain, unhurried. The voice of a good reference tool: it states what it
did and what it needs, never sells, never congratulates the user for using it.
Three words: **exact, calm, quick.**

Emotionally the target is *relief* — the sense of a heavy public system finally
getting out of the way. Not delight, not excitement.

Reference lane: Linear and Raycast. Precision instruments. Tight type, restrained
neutrals, near-invisible chrome, keyboard-first, motion that reports state and
nothing else.

## Anti-references

- **The Mahabhulekh portal itself.** Cramped nested tables, clashing system
  colors, full-page postbacks, marquee-era government web. Being unlike this is
  the entire premise.
- **Generic AI/SaaS marketing UI.** Gradient hero, glassy cards, an identical
  icon-plus-heading card grid, a big-number stat row. There is no product to
  sell here; there is a record to fetch.
- **Crypto/neon dark dashboards.** Glowing accents, saturated darks, heavy
  shadows. Reads untrustworthy for something adjacent to legal ownership.
- **Playful consumer apps.** Illustrations, mascots, rounded blobs, bouncy
  motion. Land disputes are not fun.

Specifically: green is the reflex color for anything agricultural or
land-related. Bhumi does not use it.

## Design Principles

1. **The record is the product.** Chrome exists only to shorten the path to a
   7/12. Once the document is on screen, nothing competes with it.
2. **Earned familiarity over invention.** Standard controls, standard cascade,
   standard keyboard behaviour. Nobody should have to learn Bhumi. Novelty here
   is a cost paid by a stranger in a hurry.
3. **Legible in bad conditions.** Sunlight, a cheap screen, a slow connection,
   Devanagari place names. Contrast, tap targets and font choice are decided
   against the worst case, not the demo.
4. **Show the speed, and name every wait.** The portal is slow and looks slow.
   Bhumi is fast and must look it: instant filtering, no layout jumps,
   skeletons where a list is coming. When the wait is the portal's, say so in
   words ("Mahabhulekh is slow; this usually takes 5–20 seconds.") so it never looks like Bhumi froze.
5. **Never ask for what can be supplied.** The portal wants a mobile number it
   does nothing with; Bhumi makes one up on the device and never asks. A
   single taluka, village or search result is picked without a tap. The places
   a person uses most rise to the top of each list.
6. **Plain words over the portal's.** "Where is the land?", not "Select
   cascade"; Survey number, not `pin`. Every record type says in one line what
   it is for, so a first-timer can pick the right one.
7. **Serious, because the stakes are.** Ownership is legal and contested. State
   the portal's own "not for legal purpose" caveat plainly and never overclaim
   what a fetched record is.

## Accessibility & Inclusion

WCAG 2.2 AA, in full, treated as a floor rather than a target — this is a client
for a public service.

- 4.5:1 for all text, 3:1 for control boundaries and state indicators.
- A visible focus indicator on every interactive element; the whole cascade
  completable by keyboard alone.
- Real combobox semantics (`role="combobox"`, `aria-expanded`,
  `aria-activedescendant`), live regions for async state, `role="alert"` on
  errors.
- `prefers-reduced-motion` respected; no information carried by motion or by
  colour alone.
- Minimum 44px touch targets on coarse pointers; inputs at 16px on mobile so iOS
  never zooms on focus.
- Devanagari set in a face built for it, not left to a fallback.
