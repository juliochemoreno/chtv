# CHTV — Development Rules

> **CHTV** — Live Broadcast Deck for HLS/M3U streaming with EPG, logo lookup and Chromecast support. Self-hosted on Cloudflare Workers. BYOM3U (Bring Your Own M3U) — the app is a neutral player/manager, not a content provider.

---

## 1. Core Principles

- **Functional React only** — hooks, no class components.
- **Stadium Broadcast aesthetic** — broadcast control room visual language. Anton (display), Manrope (sans), JetBrains Mono (mono). Color tokens via `--color-accent` / `--accent-rgb` for theming.
- **CSS Modules + design tokens** — no Shadcn UI, no utility-class spam. Each component has its own `.module.css` co-located. Global tokens live in `src/client/index.css` inside `@theme {}`.
- **BYOM3U philosophy** — never ship streams in the repo. The app imports playlists at runtime; users bring their own M3U URLs.
- **Sidebar-first nav** — left rail `Sidebar` is the only nav surface. Public items (En Vivo / Canales / Eventos) always visible; Admin items (Dashboard / Listas) anchored at the bottom only when the API key is present. The horizontal navbar is dead.
- **Code and comments in English**, user-facing strings in Spanish (broadcast labels included — e.g. `EN VIVO` not `LIVE`, `SIN SEÑAL` not `OFF AIR`).
- **TypeScript on the worker, JavaScript on the frontend** (intentional — the frontend is React 19 + Vite, the worker is the typed surface that touches D1).
- **`overflow-x: clip` (never `hidden`)** when preventing rogue horizontal scroll on `html`/`body`/`#root`. `hidden` creates a scroll container and silently breaks every `position: sticky` in the app.
- **Audit `*.module.css` for duplicate selectors** when extending a shared module (`Admin.module.css` is ~1.7k lines). CSS Modules apply the LAST declaration silently — duplicates are invisible bugs. Quick check: `awk '/^\.[a-zA-Z]/ {print $1}' file.module.css | sort | uniq -d`.
- **`cbRef` pattern for callbacks in long-lived effects.** When an effect is keyed by a stable identifier (e.g. `[channel.slug]`) but needs to call parent callbacks, store them in a ref kept fresh by a separate sync effect. Reading `cbRef.current.onX` inside the slug-keyed effect avoids stale closures without re-subscribing the imperative resource (`hls.js`, IntersectionObserver, etc.). See `VideoPlayer.jsx` for reference.

---

## 2. Tech Stack

### Frontend (`src/client/`)

| Tool | Version | Purpose |
|---|---|---|
| React | 19 | UI framework |
| JavaScript (`.jsx`) | — | No TypeScript on the client (intentional) |
| React Router | 7 | Client-side routing |
| Vite | 6 | Build tool + dev server |
| Tailwind CSS | 4 | `@theme {}` design tokens (CSS-first config). **Keyframes inside `@theme {}` are exposed as `--animate-<name>` variables — reference them via `animation: var(--animate-name);`. `animation-name: <name>;` will silently no-op.** |
| **CSS Modules** | — | Component styles (one `.module.css` per component) |
| Motion (`motion/react`) | 12 | Animations + drag (mini player) |
| Embla Carousel | 8 | Horizontal channel rails |
| Lucide React | 1 | All icons (no other libs) |
| `hls.js` | 1 | HLS m3u8 playback (loaded via CDN in `index.html`) |
| Google Cast SDK | — | Chromecast (loaded via CDN) |

### Backend (`src/worker/`)

| Tool | Version | Purpose |
|---|---|---|
| Cloudflare Workers | — | Serverless runtime |
| **TypeScript** | 5 | The worker is fully typed |
| Hono | 4 | HTTP routing |
| Cloudflare D1 | — | SQLite on the edge (binding `DB`) |
| Cloudflare Cache API | — | `caches.default` for edge cache (logos dataset, EPG) |
| Wrangler | 3 | Deploy + local dev (via `@cloudflare/vite-plugin`) |

### Auth model

- **Single admin** with an API key stored in Cloudflare secret `ADMIN_API_KEY` (set via `wrangler secret put`).
- Client stores the key in `localStorage["apiKey"]`.
- All admin endpoints use `requireApiKey` middleware (returns 401 if missing/invalid).
- Frontend uses `useAuthGuard` hook to detect 401 → auto-logout + redirect to `/admin?expired=1`.

### Trust boundary

CHTV is designed for **single-tenant self-hosted** deployments (BYOM3U). Anyone with network access to the deck is assumed trusted. Two endpoints intentionally have NO auth and NO rate-limiting on this assumption:
- `POST /api/channels/:id/report-error` — public so the player can auto-deactivate dead streams without exposing the API key.
- `GET /api/channels/`, `/api/categories/`, `/api/playlists`, `/api/streams/:slug` — public catalog reads.

If the deployment is ever exposed to untrusted clients (public URL, multi-tenant), an attacker can disable any channel with three anonymous POSTs to `report-error`. Before going public, add per-IP rate-limiting via Cloudflare KV or an opaque session token.

### External data sources

- **iptv-org/api** (channels.json, logos.json) — for the LogoPicker and future enrichment.
- **iptv-org/iptv** — pre-built M3U playlists by country/category/language (import presets).
- **iptv-epg.org** (planned) — XMLTV EPG by country.
- **pltvhd.com/diaries.json** — daily sports event agenda (used by `LiveTicker` and `DailyEvents`).

---

## 3. Architecture

```
src/
├── client/                          <- React 19 frontend (JavaScript)
│   ├── App.jsx                      <- Root router + providers (Theme/Channels/Favorites)
│   ├── main.jsx                     <- Entry point
│   ├── index.css                    <- Tailwind v4 + @theme tokens + global resets
│   ├── components/                  <- Reusable components (each with .module.css)
│   │   ├── Sidebar/                 <- Control Deck rail (public + admin nav, expand toggle)
│   │   ├── TopBar/                  <- Sticky top strip (hosts the LiveTicker)
│   │   ├── Navbar/                  <- Legacy folder — only `LiveTicker` and `ThemeSwitcher` remain
│   │   ├── Hero/                    <- Main player + draggable mini player
│   │   ├── ChannelCard/             <- tile + row variants
│   │   ├── ChannelRail/             <- Embla carousel
│   │   ├── DailyEvents/             <- Agenda from pltvhd.com
│   │   ├── LogoPicker/              <- Logo search modal + LogoField + BulkLogoFiller
│   │   ├── VideoPlayer/             <- forwardRef API for play/pause/mute/fullscreen
│   │   ├── CastButton/              <- Chromecast
│   │   └── LoadingSpinner/
│   ├── context/                     <- React contexts
│   │   ├── ChannelContext.jsx       <- Channels + URL sync (?ch=slug) + localStorage
│   │   ├── FavoritesContext.jsx
│   │   └── ThemeContext.jsx         <- Multi-palette + localStorage
│   ├── pages/                       <- Top-level routes
│   │   ├── Home.jsx, Channels.jsx, Events.jsx, ChannelPage.jsx
│   │   └── Admin/
│   │       ├── AdminLogin.jsx, AdminDashboard.jsx, AdminImport.jsx
│   │       ├── ChannelForm.jsx, AdminChannelCard.jsx
│   │       ├── useAuthGuard.js      <- 401 → logout + redirect
│   │       └── Admin.module.css     <- Shared admin styles
│   ├── hooks/                       <- Generic hooks (useChannels, useFavorites, etc.)
│   └── services/
│       └── api.js                   <- Single fetch client for /api/*
└── worker/                          <- Cloudflare Worker (TypeScript)
    ├── index.ts                     <- Entry + route registration
    ├── routes/                      <- One file per domain
    │   ├── channels.ts, categories.ts, streams.ts
    │   ├── auth.ts, proxy.ts, import.ts, logos.ts
    │   └── (future: playlists.ts, epg.ts)
    └── lib/
        ├── types.ts                 <- Env, Channel, Category types
        ├── auth.ts                  <- requireApiKey, hashPassword, JWT
        ├── http.ts                  <- fetchWithTimeout (anti-hang)
        ├── stream.ts                <- HTML scraper for tvtvhd-style upstreams
        └── m3u.ts                   <- M3U parser + slugify

migrations/                          <- D1 migrations (numbered, sequential)
├── 0001_init.sql
├── 0002_more_channels.sql
└── 0003_extend_schema.sql

.agents/                             <- Hopla planning structure (this layer)
```

Key rules:
- **One CSS module per component**, co-located. Global tokens via `var(--color-*)`.
- **Sticky shell pattern**: top strip is the `LiveTicker` (`top: 0; z-index: 70`, height = `--shell-top-h: 28px`). The Sidebar is sticky below the ticker. Page-level sticky controls (Channels/Events/Admin headers) wrap their `header + filters` in a single `.stickyTop` (or `.controlsBar` for admin) anchored at `top: var(--shell-top-h, 28px)` with `margin: 0 -28px` so the bg extends edge-to-edge.
- **Page header pattern**: every catalog/list page (Home, Channels, Events, Admin Dashboard, Admin Playlists) uses the same shell — `.titleBlock` left (kicker `// SECTION` + Anton title + sans subtitle) and a context-specific block right (`.statsBlock` / `.nextBlock` with optional `border-left ámbar` when something is "live"). Filters row goes below as siblings inside the same flex container (search compact + chips + reset). See `Channels.jsx`/`Events.jsx` for reference.
- **Drag transforms only via Motion**: never combine CSS `transform` keyframes with `style={{ x, y }}` motion values on the same element (race condition). Use opacity-only animations.
- **Worker handlers must always return a Response within 30s** — use `fetchWithTimeout` for all upstream `fetch` calls (avoids miniflare "script will never generate a response").
- **Cap external-fetch endpoints at <100 items per call.** Endpoints that probe each row with an HTTP fetch (health-check, link validation, batch import) MUST limit per-call workload — Workers terminate at 30s wall-clock. Return `{ checked, partial: true, remaining: N }` so the UI can resume. See `POST /api/playlists/:id/health-check` for reference.
- **D1**: all queries use prepared statements (`.prepare(sql).bind(...)`). For counters under contention prefer `UPDATE … SET col = col + 1 … RETURNING col` in a single statement instead of `SELECT → compute → UPDATE` (atomic, race-free). See `POST /api/channels/:id/report-error` for reference.
- **Cross-component channel-data sync**: admin mutations dispatch `chtv:channels-change` (helper `notifyChannelsChanged()` in `lib/channelEvents.js`); `ChannelContext` listens and re-fetches. Use this whenever an admin action affects what public views display (channel CRUD, playlist sync, health-check, etc.).
- **URL is source of truth for current channel** on the home (`?ch=slug`), with `localStorage` fallback. Use the `lastSyncedSlugRef` pattern in `ChannelContext` to avoid sync loops.

---

## 4. Code Style

### JavaScript (frontend)
- Functional components, hooks only.
- Component file matches name: `Hero.jsx` exports `Hero`.
- CSS module imported as `import styles from './Hero.module.css'`.
- Path alias: `@` → `/src/client` (defined in `vite.config.ts`).
- No PropTypes, no TypeScript on frontend.

### TypeScript (worker)
- `strict: false` (per repo `tsconfig.json`).
- One route file per domain in `worker/routes/`.
- Types in `worker/lib/types.ts`.
- Always handle 401 explicitly in handlers that need auth.

### Naming
- Components / Pages: `PascalCase.jsx`
- Hooks: `useCamelCase.js`
- Services / utils: `camelCase.js`
- CSS modules: `Component.module.css`
- Worker routes: `lowercase.ts`
- Constants: `UPPER_SNAKE_CASE`

### Visual / UI conventions
- Section labels with broadcast prefix: `// CONTROL ROOM`, `// CANALES`, `// AGENDA`.
- Channel numbers always padded `CH·07` not `CH·7`.
- Live indicator uses the amber color (`--color-amber`) with `--animate-pulse-live`.
- Buttons primary use clip-path polygon (broadcast aesthetic).

---

## 5. Testing

- **No tests yet.** When added, use Vitest (matches Vite ecosystem).
- For now, validate manually with: `npm run typecheck` + `npm run build` + curl smoke tests against `localhost:5173`.

---

## 6. Development Commands

```bash
npm run dev                     # Vite dev server with @cloudflare/vite-plugin (port 5173)
npm run build                   # Production build (client + worker)
npm run preview                 # wrangler dev (production-like local)
npm run deploy                  # Build + deploy to Cloudflare Workers

# Database
npm run db:migrate:local        # Apply D1 migrations locally
npm run db:migrate:remote       # Apply D1 migrations to production
npm run db:seed:local           # Seed initial data (0001_init.sql)

# Validation
npm run typecheck               # tsc --noEmit (worker only — frontend is JS)
```

### Useful curl checks
```bash
curl http://localhost:5173/api/health
curl http://localhost:5173/api/channels/
curl "http://localhost:5173/api/logos/search?q=espn&limit=3"
```

---

## 7. Task-Specific Reference Guides

_None yet. Guides are added on-demand as `.agents/guides/*.md` when a recurring task pattern emerges (e.g., "When adding a new admin page", "When adding a Worker route with auth")._
