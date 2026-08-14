# RelayRow — brand assets

**Status: mark approved (2026-08-14).** Concept A "Relay Rows" is the RelayRow identity. The two
alternates that were proposed alongside it (a double-chevron handoff and an R monogram) were
rejected and their files removed — do not reintroduce them.

Everything here is hand-written SVG: no raster, no external fonts baked in, infinitely scalable,
and small enough to inline in the app.

```
branding/
  favicon.svg                    ← drop-in replacement for the ⚡ emoji favicon in index.html
  preview.html                   ← open in a browser to see every asset side by side
  BRAND_BRIEF.md                 ← hand this to any agent/dev applying the brand in the app
  logo/
    relayrow-mark.svg            ← primary mark (works on light or dark)
    relayrow-mark-tile.svg       ← app icon / social avatar (dark squircle, 96×96)
    relayrow-mark-mono.svg       ← single-colour, inherits `currentColor`
    relayrow-lockup-light.svg    ← mark + wordmark, for light backgrounds
    relayrow-lockup-dark.svg     ← mark + wordmark, for dark backgrounds
```

## The mark — "Relay Rows"

Three stacked rounded bars — the *rows* of an inbox — and one packet that has already left the
middle row and is in flight to the right. The middle row is the live one: it is longer than its
neighbours and carries the gradient, so the eye reads left-to-right motion without a single arrow
being drawn.

Why it works: it says *mail in a list* and *message in transit* at the same time, it is four
primitives (three rects, one circle), and it survives being shrunk to 16 px because nothing
depends on a thin line or an interior detail.

**Geometry** (64×64 viewBox, so the numbers are also the percentages ×0.64): bars are 8 units tall
with a 4-unit radius — a perfect stadium end. Rows sit at y = 13 / 28 / 43, i.e. a 7-unit gutter.
Lengths are 30 / 38 / 22 — the live row is longest, the bottom row shortest, which tips the whole
silhouette forward. The packet is r=4 at (54, 32), leaving a 6-unit gap from the live row: close
enough to belong to it, far enough to have left.

Don't redraw these by eye. If you need a variant, scale the existing file.

## Palette

Taken from the app's existing tokens (`src/App.vue`, `src/stores/branding.js`) so the logo and the
product agree. This is exactly the `relayrow-indigo` theme preset.

| Token | Hex | Use |
| --- | --- | --- |
| Indigo (primary) | `#6366F1` | mark base, buttons — `--rr-accent` |
| Indigo light | `#818CF8` | mark base on dark backgrounds |
| Cyan (signal) | `#22D3EE` | the in-flight packet, gradient end |
| Ink | `#020617` | background — `--rr-bg` |
| Ink surface | `#0F172A` | cards — `--rr-bg-surface` |
| Border | `#1E293B` | hairlines — `--rr-border` |
| Paper | `#F8FAFC` | text on dark — `--rr-text` |

Gradient: `#6366F1 → #22D3EE` on light grounds, `#818CF8 → #22D3EE` on dark, running roughly
left-to-right and slightly upward — so the motion of the gradient and the motion of the packet
point the same way.

## Wordmark

`Relay` in the text colour, `Row` in the gradient — one word, two beats. Set in Inter 600 at
`-0.6` tracking (falls back to Segoe UI / system-ui). **Before this goes to print or to a
third party, convert the `<text>` element to outlines** — an SVG that references a font will
render differently on a machine that lacks it.

## Clear space & minimum size

- Clear space on all sides = the height of one bar (⅛ of the mark's height).
- Minimum size: mark 16 px, lockup 120 px wide. Below 24 px use `favicon.svg`, which is redrawn
  with fewer, chunkier elements.
- Never rotate the mark, never restack the rows, never re-colour the packet to anything but the
  cyan signal. The packet is the only saturated cyan in the system; that is what makes it read.

## Usage

Wire the favicon up by replacing the inline data-URI in `index.html`:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

…after copying `branding/favicon.svg` to `public/favicon.svg` (that folder is served at the root).

For the mono mark, set a colour on the parent and it follows:

```html
<span style="color: var(--rr-accent)"><!-- inline relayrow-mark-mono.svg --></span>
```

## The white-label caveat

RelayRow is multi-tenant and `src/stores/branding.js` lets a tenant override `--rr-accent`,
`--rr-bg`, `--rr-bg-surface`, `--rr-text` and supply its own `logoSvg`. So:

- The **gradient** mark is the RelayRow house mark. Use it only on RelayRow-owned surfaces —
  marketing site, login, super-admin, RelayRow's own transactional email.
- On **tenant-themed** surfaces use `relayrow-mark-mono.svg` tinted with `var(--rr-accent)`, or
  the tenant's own `logoSvg` when one is set. A hardcoded indigo mark inside a tenant's amber
  theme is the bug this rule exists to prevent.

See `BRAND_BRIEF.md` for the full set of rules to hand to whoever applies this in the app.

## Still open

1. Cyan as the signal colour, or single-hue indigo for a more restrained, enterprise feel?
2. Wordmark as `RelayRow` (camel) or `relayrow` (all lowercase, more infra-flavoured)?
