# Design System — "Calm Depth"

## Contract

| | |
|---|---|
| Surface | HRMS operations tool used every day by HR, occasionally by employees |
| User's job | Scan today's workforce state, act on exceptions (late, absent, pending leave), run payroll |
| Primary actions | Review leave, simulate/import attendance, run & finalize payroll |
| Hierarchy | KPI row → trends → actionable lists; tables stay dense and scannable |
| Target viewports | `390x844` (phone), `1440x900` (desktop) |
| Themes | Light, Dark, System (follows OS); choice remembered per browser |

**Direction.** Quiet, dense, Linear/Vercel-style surfaces where **depth comes from light** (layered soft shadows, a 1px top highlight, faint brand-tinted glow) instead of heavy gradients. One brand accent on neutral greys. Motion only explains state: page enter, list stagger, number count-up, sliding tab/nav indicator, modal spring. Everything respects `prefers-reduced-motion`.

**Memorable details.**
1. The login screen's **3D product scene**: floating glass cards (attendance ring, payslip, biometric scan) in perspective that tilt with the pointer.
2. **KPI cards tilt in 3D** with a light sheen that follows the cursor.

**Reference observations** (research, Nov 2026): dark-first operational tools (Linear, Vercel, Supabase); depth via lighting/glow rather than skeuomorphism; dashboard motion restrained to comprehension; command palettes (⌘K) for fast navigation.

## Tokens (`web/app/globals.css`)

| Token | Purpose |
|---|---|
| `--brand` | The single accent colour. All `brand-50…900` shades are derived from it with `color-mix`, so **an organisation re-themes the app by changing one value** |
| `--canvas`, `--surface`, `--surface-2` | Page background, cards, raised/inset areas |
| `--border`, `--ring` | Hairlines and focus rings |
| `.elevated`, `.floating` | Elevation levels |
| `slate-*` | Neutral text/lines; remapped in dark mode so existing classes adapt |
| `emerald/rose/amber/sky/violet` | Status only (present/absent/late/leave/holiday); remapped to dark tints in dark mode |

## Organisation theming (white-label)

Admins re-brand the whole product in **Settings → Branding** — no code changes or rebuilds:

| Setting | Effect |
|---|---|
| Product name | Sidebar, browser tab title, login page |
| Logo (PNG/JPEG/WebP/SVG, ≤ 300 KB) | Sidebar, login page, favicon, PDF payslip header (PNG/JPEG) |
| Brand colour | Buttons, links, active navigation, focus rings, PDF header; full `brand-50…900` scale derived with `color-mix` |
| Accent colour | Glows, chart highlights, gradients |
| Default theme | Light / Dark / System for anyone who hasn't chosen their own |
| Corner style | Sharp / Soft / Rounded — scales every `rounded-*` radius |

How it works:
- Stored on `CompanySettings`; read via the **public** `GET /api/branding` (the login page is branded before sign-in) and saved via admin-only `PUT /api/settings/branding` (validated hex colours and image data URLs). The logo is stored as a data URL so no file storage or volume is needed in Docker/Kubernetes.
- `web/lib/branding.tsx` sets `--brand`, `--brand-glow`, `--brand-fg` and `--radius-scale` on `<html>`, plus the title and favicon. The last branding is cached in `localStorage` and re-applied by an inline script before hydration, so there is no flash of the default colours.
- **Readable text on brand surfaces:** `--brand-fg` is white while white keeps ≥ 3.4:1 contrast with the brand colour, otherwise near-black. The Branding tab warns when a pale colour is chosen.
- **Live preview:** edits re-theme the entire app instantly; nothing is saved until *Save*; leaving the tab or *Discard* reverts.

## Content states

| State | Treatment |
|---|---|
| Loading | Skeleton rows/cards keep layout stable |
| Empty | Short reason + next action (e.g. "Simulate device feed") |
| Error | Toast with the API's specific message; form errors inline |
| Partial | Paged tables show counts; reports cap at 500 rows with "export for full list" |
| Success | Toast confirmation; data revalidates in place |
| Permission | API returns 403/404; employees never see HR navigation, redirected to self-service |
