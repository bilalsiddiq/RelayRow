# Frontend Architecture & Design System Guidelines

This document details the Vue 3 frontend architecture, state stores, router configuration, and `--xe-*` vanilla CSS styling system.

---

## 1. Vue 3 Store Architecture

The application uses singleton reactive stores in `src/stores/`:

- **`auth.js` (`useAuthStore`)**:
  - Manages Supabase Auth session, current user state, and `isSuperAdmin` (`inbox_is_staff`) RPC status.
  - Implements `signIn(email, password)`, `signUp(...)`, and `signOut()`.

- **`branding.js` (`useBrandingStore`)**:
  - Fetches white-label branding from `public.app_branding` via `supabase`.
  - Exposes `appName`, `appUrl`, `logoUrl`, `logoSvg`, and primary brand accents dynamically.

---

## 2. View Hierarchy & Routing (`src/router/index.js`)

| Route Path | Component View | Purpose |
| :--- | :--- | :--- |
| `/` | `LandingView.vue` | Marketing landing page with interactive AI triage simulator, pricing calculator, and features grid |
| `/login` | `LoginView.vue` | Clean standard authentication page |
| `/inbox` | `inbox/InboxView.vue` | Member-facing multi-mailbox client with CSP HTML sandbox email viewer |
| `/admin` | `admin/AdminInboxView.vue` | Super Admin console for managing domains, forwarders, membership plans, and AURA LLM keys |
| `/tenant/settings` | `tenant/TenantSettingsView.vue` | Org Admin console for domain seat allocation and team member roles |

---

## 3. Vanilla CSS Design Tokens (`var(--xe-*)`)

RelayRow enforces a dark, glassmorphic design system using CSS variables:

```css
:root {
  --xe-bg: #09090b;
  --xe-bg-surface: #121215;
  --xe-bg-card: #18181b;
  --xe-border: rgba(255, 255, 255, 0.08);
  --xe-border-focus: #6366f1;
  --xe-text: #f4f4f5;
  --xe-text-muted: #a1a1aa;
  --xe-text-dim: #71717a;
  --xe-accent: #6366f1;
  --xe-accent-hover: #4f46e5;
  --xe-danger: #ef4444;
  --xe-success: #10b981;
  --xe-radius: 8px;
  --xe-radius-lg: 12px;
  --xe-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  --xe-transition: 0.2s ease;
}
```

- Components must use pre-defined `--xe-*` tokens.
- UI elements feature hover micro-animations and smooth CSS transitions.
