# Design

## Visual Theme

**Registry ink on paper.**

A land record is a document. Bhumi is the desk it is read on. The surface is
warm paper; every mark the user makes on it — selection, focus, the primary
action — is register blue, the colour of a stamp pad in a revenue office.
Nothing else is coloured. That single opposition (warm ground, cold mark) does
all the work, so the interface can stay almost entirely achromatic and still
feel decided rather than unfinished.

Light is the default. The scene: someone standing in a field or a queue,
checking a 7/12 on a phone in direct sun. Dark is a real alternative, not an
inversion — the same warm hue rotated to a night desk (warm charcoal, never
navy, never black), for the person checking a record in bed.

Colour strategy: **Restrained.** One accent, under 10% of any screen, on
primary action / selection / focus / links only.

## Mark

A village map in miniature: one survey plot, divided, with the share that is
yours filled in saffron — which is what every lookup here ends in. Register
blue tile, paper lines, one saffron field (`#f4a437`). The saffron is the
mark's alone; it never appears in the interface.

The geometry lives once, in `apps/web/src/lib/brand.tsx`, and every surface
draws from it: the masthead (`<Mark>`), the vector favicon (`/mark.svg`), the
PNG and maskable PWA icons (`/icons/*`), the Apple touch icon and the social
card. Changing a path there changes all of them.

## Color

All colours are OKLCH. Every neutral is tinted toward hue 75 (warm) so nothing
reads as a cold digital grey. No `#000`, no `#fff`.

### Light — paper

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `oklch(0.976 0.005 75)` | Page. Warm paper. |
| `--surface` | `oklch(0.995 0.002 75)` | Raised: inputs, popovers, the record frame. |
| `--surface-sunken` | `oklch(0.958 0.006 75)` | Recessed: segmented track, code, skeletons. |
| `--surface-hover` | `oklch(0.938 0.008 75)` | Hover fill on neutral controls. |
| `--line` | `oklch(0.900 0.008 75)` | Decorative hairlines and section rules. |
| `--line-control` | `oklch(0.605 0.014 75)` | Control boundaries. 3.8:1 on `--surface`. |
| `--text` | `oklch(0.235 0.012 75)` | Primary. 15.6:1. |
| `--text-2` | `oklch(0.400 0.012 75)` | Secondary, labels. 8.6:1. |
| `--text-3` | `oklch(0.490 0.010 75)` | Tertiary, hints, placeholders. 5.9:1. |
| `--accent` | `oklch(0.47 0.16 256)` | Solid fill (`#0158b2`). `--on-accent` on it: 6.8:1. |
| `--accent-hover` | `oklch(0.41 0.16 256)` | Primary button hover. 8.7:1. |
| `--accent-fg` | `oklch(0.45 0.16 256)` | Accent as text/border/ring. 7.0:1 on `--bg`. |
| `--accent-soft` | `oklch(0.95 0.03 256)` | Selected-row tint. `--accent-fg` on it: 6.5:1. |
| `--danger` | `oklch(0.475 0.160 27)` | Errors. 6.8:1 on `--bg`. |
| `--danger-soft` | `oklch(0.958 0.022 27)` | Error panel fill. |
| `--paper` | `oklch(0.99 0.003 75)` | The scanned document. Never themed. |

### Dark — night desk

Same hues, rotated. Warm charcoal ground, ink lifted so it stays legible.

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `oklch(0.185 0.008 75)` | Page. |
| `--surface` | `oklch(0.228 0.009 75)` | Raised. |
| `--surface-sunken` | `oklch(0.205 0.008 75)` | Recessed. |
| `--surface-hover` | `oklch(0.275 0.010 75)` | Hover. |
| `--line` | `oklch(0.310 0.010 75)` | Hairlines. |
| `--line-control` | `oklch(0.530 0.012 75)` | Control boundaries. 3.2:1 on `--surface`. |
| `--text` | `oklch(0.945 0.006 75)` | Primary. |
| `--text-2` | `oklch(0.735 0.008 75)` | Secondary. 7.9:1. |
| `--text-3` | `oklch(0.615 0.008 75)` | Tertiary. 5.0:1 on `--bg`, 4.6:1 on `--surface`. |
| `--accent` | `oklch(0.50 0.16 256)` | Solid fill, lifted a step. `--on-accent`: 5.9:1. |
| `--accent-hover` | `oklch(0.54 0.16 256)` | Hover lightens on a dark ground. 5.0:1. |
| `--accent-fg` | `oklch(0.76 0.12 256)` | Accent as text/border/ring. 8.7:1 on `--bg`. |
| `--accent-soft` | `oklch(0.30 0.06 256)` | Selected-row tint. `--accent-fg` on it: 6.4:1. |
| `--danger` | `oklch(0.700 0.150 27)` | Errors. |
| `--danger-soft` | `oklch(0.285 0.050 27)` | Error panel fill. |

Every ratio above is measured, not estimated: OKLCH is converted to linear
sRGB and scored with the WCAG 2.x formula. Every text and boundary pair
clears its threshold in both themes.

### Rules

- The accent appears on: the primary button, the active segment, the selected
  option, the focus ring, a completed step's number, the current page in the
  masthead, and links. Nowhere else.
- Inactive and disabled states are neutral only — never a desaturated accent.
- No colour carries information on its own; every coloured state also has a
  weight, icon, border or text change.

## Typography

Two families, one job each. Both self-hosted via `next/font` — no runtime
webfont request, no layout shift.

- **Inter** — all Latin UI text. Variable, `wght 100..900`.
- **Noto Sans Devanagari** — Marathi village, taluka and occupant names. Set as
  the second family in the same stack so mixed strings resolve per-glyph.

Feature settings applied globally: `"cv05" 1` (tailed lowercase l),
`"ss03" 1` (rounded quotes), `"zero" 1` (slashed zero) and `"tnum" 1` on every
surface that shows an identifier — survey/gat numbers, khata, CTS, mojani,
mobile — so digits align in a column and 0 never reads as O.

### Scale — fixed rem

Sized for reading at arm's length on a cheap phone in sunlight: nothing
running text is set below 13px.

| Token | Size | Use |
| --- | --- | --- |
| `--t-micro` | 0.75rem / 12px | Step numbers, overlines. |
| `--t-xs` | 0.8125rem / 13px | Footnotes, counts, metadata. |
| `--t-sm` | 0.875rem / 14px | Hints, secondary rows, small buttons. |
| `--t-base` | 0.9375rem / 15px | UI body, buttons, options. |
| `--t-md` | 1rem / 16px | Inputs, lede. |
| `--t-lg` | 1.125rem / 18px | Section and step headings, wordmark. |
| `--t-xl` | 1.5rem / 24px | Page titles: the intro, the record title. |

Inputs are **1rem/16px below 640px** regardless of the scale, so iOS never zooms
on focus. Weight carries hierarchy alongside size: 400 body, 500 secondary,
560 labels and section headings, 620 wordmark and primary action.

Prose caps at 68ch. Line height 1.5 for body, 1.25 for headings, 1.6 for the
footnote.

## Spacing & Layout

4px base. Tokens `--s1`…`--s10` = 4, 8, 12, 16, 20, 24, 32, 40, 56, 72.

Rhythm is deliberately uneven: 6px label-to-control, 16px between fields in a
group, 32px between steps, 56px before the record. Even padding everywhere is
what makes an interface read as generated.

- Single column, `max-width: 640px`, centred. Wide screens get air, not columns —
  a two-column form would break the one-thing-at-a-time cascade.
- **No card.** The form sits directly on the page and is divided into three
  numbered steps by hairline rules. Cards here would be a container around the
  only content on the page.
- Paired fields (district/taluka, the Kami-Jasti selectors) go side by side at
  ≥560px and stack below it.
- There is no sticky action bar. A search's results are themselves the way
  into a record — tap a row and it opens — and a single result opens on its
  own, so there is no separate "Open" button to keep in reach. Kami-Jasti, the
  one flow with a final button, keeps it in flow and names what is still
  missing beside it.

## Components

Every interactive element ships default, hover, focus-visible, active, disabled,
loading and selected. Focus is a 2px `--accent-fg` ring at 2px offset — the same
ring everywhere, never removed, never replaced by a colour change alone.

Controls are 44px tall on any touch screen, whatever its width. They tighten to
38px only for a mouse on a screen at least 640px wide.

- **Segmented control** — record type. Sunken track, raised active thumb with
  `--accent-fg` text. Arrow-key navigable, `role="radiogroup"`.
- **Combobox** — type-to-filter over hundreds of options. Full ARIA
  (`role="combobox"` + `aria-activedescendant`), a chevron that rotates on open,
  match highlighting, `aria-live` count, and a scroll-into-view active row.
- **Step** — number chip + heading. A finished step fills its number with the
  accent; an unanswered one stays neutral. Steps 1 and 2 render from first
  paint, their controls disabled until the one above is answered, so nothing
  above the reader moves as the cascade fills in. Step 3 appears below once a
  village is chosen, because what it asks depends on that village.
- **Skeleton** — a sunken bar with a slow sheen. Replaces every "Loading…"
  placeholder in a control.
- **Loading** — spinner plus a sentence saying what is being waited on. Long
  portal waits step through named stages ("Mahabhulekh is slow; this usually takes 5–20 seconds.") so a slow
  government server never looks like a frozen app.
- **Failure** — a plain-language reason and a Retry that re-runs just the
  failed request, never a page reload.
- **Toast** — one at a time, bottom of the screen, `role="status"`. Used for
  undo after removing saved records.
- **Record frame** — always paper white regardless of theme (the document is a
  scan; inverting it would be lying), 1px `--line-control` border, full-bleed on
  mobile.

## Motion

- `--dur-fast: 120ms` for hover/press, `--dur: 180ms` for reveals and popovers.
- Easing is `cubic-bezier(0.22, 1, 0.36, 1)` — ease-out-quart. No bounce, no
  elastic, no spring.
- Transform and opacity only. Never height, width, top or margin.
- Motion reports state: a popover opening, a step becoming available, a record
  arriving. Nothing animates for decoration and nothing animates on page load.
- Under `prefers-reduced-motion: reduce`, all durations collapse to 1ms and the
  skeleton sheen stops.
