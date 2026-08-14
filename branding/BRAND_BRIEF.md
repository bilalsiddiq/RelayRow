# RelayRow brand brief — for the agent applying it

Hand this file (or the prompt at the bottom) to any agent or developer working on RelayRow UI.
It is the single source of truth for how the identity is applied. Source assets live in
`branding/`; rationale and geometry live in `branding/README.md`.

---

## 1. The identity in one paragraph

RelayRow's mark is **"Relay Rows"**: three stacked rounded bars (the rows of an inbox) with one
cyan packet already in flight to the right of the middle row. The middle row is longest and carries
an indigo→cyan gradient, so the whole silhouette leans forward. The tone is *quiet infrastructure*:
dark, precise, low-chrome, fast. Not playful, not neon, not glassmorphic.

## 2. Tokens — use them, never hardcode

The app already declares its design system in `src/App.vue` and drives it from
`src/stores/branding.js`. **Every colour in new UI comes from a CSS variable.** A literal hex in a
component is a bug, because a tenant can retheme the app at runtime.

```css
/* house tokens — the RelayRow default (theme preset `relayrow-indigo`) */
--rr-accent:             #6366F1;   /* tenant-overridable */
--rr-accent-hover:       #4F46E5;   /* derived at runtime */
--rr-accent-transparent: rgba(99,102,241,.15);
--rr-bg:                 #020617;   /* tenant-overridable */
--rr-bg-surface:         #0F172A;   /* tenant-overridable */
--rr-border:             #1E293B;
--rr-text:               #F8FAFC;   /* tenant-overridable */
--rr-font:               'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif;

/* aliases already in use across views */
--xe-bg-elevated: #1A2332;  --xe-bg-hover: rgba(255,255,255,.06);
--xe-text-muted:  #94A3B8;  --xe-text-dim: #64748B;
--xe-success: #10B981;  --xe-warning: #F59E0B;  --xe-danger: #EF4444;
--xe-radius: 8px;  --xe-radius-lg: 12px;  --xe-transition: 150ms ease;
```

Two colours are **brand-fixed and NOT tenant-overridable**:

| | |
| --- | --- |
| `#22D3EE` cyan | the in-flight packet, and the far end of the brand gradient. It is the only saturated cyan in the system — that scarcity is what makes it read as "signal". Do not use it for buttons, links, or decoration. |
| `#818CF8` indigo-light | the mark's base on dark grounds only. |

Semantic colour (success / warning / danger) is separate from the accent and never doubles as one.

## 3. Which logo file goes where

| Surface | Asset |
| --- | --- |
| Browser tab, PWA, ≤24 px anywhere | `branding/favicon.svg` (chunkier redraw) |
| App icon, social avatar, OG image | `logo/relayrow-mark-tile.svg` |
| Marketing site, login, super-admin header, RelayRow's own outbound email | `logo/relayrow-lockup-dark.svg` (or `-light`) |
| Inline in the app chrome, next to text | `logo/relayrow-mark.svg` |
| **Any tenant-themed surface** | `logo/relayrow-mark-mono.svg`, tinted `color: var(--rr-accent)` — or the tenant's own `branding.logoSvg` when set |

That last row is the one that gets broken. RelayRow is multi-tenant; `branding.js` swaps
`--rr-accent`/`--rr-bg`/`--rr-text` at runtime and a tenant can upload `logoSvg`. Dropping the
fixed indigo gradient mark into a tenant's amber theme is the failure this rule prevents. Rule of
thumb: **if the surface belongs to the tenant, the mark is monochrome and inherits their accent.**

Never: rotate the mark, restack or re-space the rows, recolour the packet, add a drop shadow, put
the gradient mark on a mid-tone background, or re-typeset the wordmark. Need a variant? Scale the
existing file.

## 4. Typography

Inter, already imported in `src/App.vue`. One family, carried by weight and spacing:

| Role | Spec |
| --- | --- |
| Page title | 30px / 600 / `-.02em` |
| Section heading | 21px / 600 / `-.01em` |
| Body & controls | 15–16px / 400–500 / normal |
| Label, eyebrow, table header | 11–12px / 600 / `.14em` / uppercase / `--xe-text-muted` |
| Numeric columns, IDs, quotas | add `font-variant-numeric: tabular-nums` |

Monospace (`ui-monospace, Consolas, monospace`) is reserved for things that are literally machine
text: DNS records, DKIM keys, API keys, message IDs, raw headers, webhook payloads.

## 5. Layout & component conventions

- Dark-first. `--rr-bg` is the page, `--rr-bg-surface` is a card, `--xe-bg-elevated` is a modal or
  popover. Separate surfaces with a 1px `--rr-border` hairline, not a shadow.
- Radius: 8px for controls and inputs, 12px for cards and modals. Pills (`999px`) only for status
  chips and tags.
- Spacing on a 4px scale. Lay sibling groups out with flex/grid `gap` — not per-element margins.
- Transitions `150ms ease`, and honour `prefers-reduced-motion`. No decorative animation; motion
  is for state changes only.
- This is an operator's tool as much as a product: surface the summary before the detail, and
  encode state in **form as well as text** — a coloured chip, a severity stripe — so what needs
  attention reads at a glance.
- Copy is written from the user's side of the screen. A person manages *domains* and *inboxes*,
  not "DNS verification records" and "mailbox rows". Buttons say what happens ("Verify domain"),
  and the toast afterwards says it happened ("Domain verified"). Errors say what went wrong and
  what to do next, without apologising.
- Wide content (tables, DNS record blocks, raw headers) gets `overflow-x: auto` on its own
  container so the page body never scrolls sideways.
- Accessibility: visible keyboard focus on every interactive element (a 2px `--rr-accent` ring),
  and body text at 4.5:1 against its own surface — check `--xe-text-dim` before using it for
  anything a user must read.

## 6. Definition of done for any brand-touching change

1. No literal hex in the diff — everything through a token.
2. Cyan `#22D3EE` appears only in a logo asset.
3. Any logo on a tenant-themed surface is the mono variant or the tenant's own.
4. It still reads at 16px and on the four non-default theme presets in `branding.js`
   (violet / teal / emerald / amber).
5. `branding/README.md` updated if you changed anything about the assets themselves.

---

## The prompt — copy from here down

> You are working on **RelayRow**, a multi-tenant email platform (Vue 3 + Vite + Supabase) at
> `X:\RelayRow-app`. The visual identity is approved and locked. Before writing any UI, read
> `branding/BRAND_BRIEF.md` and `branding/README.md`, and open `branding/preview.html` to see the
> mark. Then follow these rules:
>
> **Identity.** The logo is "Relay Rows" — three stacked rounded bars with a cyan packet in flight
> to the right. Assets are in `branding/logo/`. Use `relayrow-lockup-dark.svg` for RelayRow-owned
> chrome, `relayrow-mark-tile.svg` for app icon/avatar/OG, `branding/favicon.svg` for anything
> ≤24px, and `relayrow-mark-mono.svg` tinted `color: var(--rr-accent)` on any tenant-themed
> surface. Never rotate, restack, recolour, shadow, or re-typeset the mark — scale the existing
> file instead.
>
> **Colour.** Take every colour from the CSS variables already declared in `src/App.vue`
> (`--rr-accent`, `--rr-bg`, `--rr-bg-surface`, `--rr-border`, `--rr-text`, and the `--xe-*`
> aliases). A literal hex in a component is a bug: `src/stores/branding.js` lets a tenant
> re-theme the app at runtime, and hardcoded colour breaks white-label. Two exceptions that are
> brand-fixed and belong to logo assets only: `#22D3EE` (the cyan signal — never a button, link,
> or decoration) and `#818CF8` (the mark on dark). Semantic colour (`--xe-success/warning/danger`)
> is separate from the accent.
>
> **Type.** Inter, already imported. Carry hierarchy with weight and letter-spacing, not extra
> families: 30/600/-.02em titles, 21/600 section heads, 15–16/400–500 body, 11–12/600/.14em
> uppercase labels in `--xe-text-muted`. `tabular-nums` on any numeric column. Monospace only for
> machine text — DNS records, DKIM keys, API keys, message IDs, raw headers.
>
> **Layout.** Dark-first: `--rr-bg` page, `--rr-bg-surface` card, `--xe-bg-elevated` modal,
> separated by 1px `--rr-border` hairlines rather than shadows. 8px radius on controls, 12px on
> cards, pills only for status chips. 4px spacing scale, laid out with flex/grid `gap`.
> `150ms ease` transitions, `prefers-reduced-motion` honoured, no decorative animation. Wide
> content scrolls inside its own `overflow-x: auto` container. Visible focus ring on everything
> interactive.
>
> **Tone.** Quiet infrastructure — dark, precise, low-chrome, fast. Not playful, not neon, not
> glassmorphic. Write copy from the user's side of the screen: they manage domains and inboxes,
> a button says what happens and the toast says it happened, and errors explain the fix without
> apologising. Surface summary before detail, and encode state in form (chip, stripe) as well as
> in text.
>
> **Before you call it done:** no literal hex in the diff; cyan only inside logo assets; tenant
> surfaces using the mono mark; the UI still legible at 16px and under the four non-default theme
> presets in `branding.js` (violet, teal, emerald, amber).
