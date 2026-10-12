# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Agenda Operativa Shimaya — a field-operations management app for a restaurant chain's supervisors, trainers ("capacitadores"), coordinators and managers in Peru. It replaced a Google Apps Script system (comments throughout the code marked `FIX SEGURIDAD` call out specific vulnerabilities that migration fixed — e.g. role stored in client-editable `sessionStorage` vs. a server-signed JWT now). Next.js 14 App Router, Supabase (Postgres) as the only datastore, deployed on Vercel.

## Commands

- `npm run dev` — local dev server
- `npm run build` — production build (also runs typecheck + lint as part of `next build`)
- `npx tsc --noEmit` — typecheck only, faster than a full build; run this after any change
- `npm run lint` — ESLint (`next lint`)
- No test suite exists in this repo.

`npm run build` locally fails at the "Collecting page data" step with `SESSION_SECRET no esta configurado` unless `.env.local` is populated (see `.env.example`) — this is expected in a sandbox without secrets and is not a sign the change broke anything; `npx tsc --noEmit` plus "Compiled successfully" in the build log is enough to confirm correctness before pushing.

## Architecture

### Four roles, one middleware, one session

`supervisor`, `capacitador`, `coordinador`, `gerente` are the only roles (`lib/session.ts`). Each has its own portal at `/panel/<rol>` (`app/panel/<rol>/page.tsx` or `panel-tabs.tsx`), built from `PanelShell` (`app/panel/panel-shell.tsx`) with an array of `ItemMenuPanel` (id, label, icon, content) passed in per role. Session is a signed JWT in an httpOnly cookie (`lib/session.ts`); `middleware.ts` checks the JWT's `rol` claim against the `/panel/<rol>` path segment on every request, before any page or Server Action runs — client code never decides access. `Central Analítica`, `Registro`, `Documentos`, `Calendario` and `Auditorías` are shared routes the middleware only checks for a valid session on; fine-grained access (who can register users, see others' calendars, etc.) is re-checked inside the page/Server Action itself (`lib/permisos.ts`).

Every Server Action re-validates its own authorization — `lib/session.ts` exports `exigirSesion()`, `exigirCoordinador()`, `exigirGerente()`, `exigirGerenteOCoordinador()` as shared guards (previously duplicated per-file; centralize new guards there instead of re-declaring them).

Supervisor, coordinador and capacitador all do field visits and share the same "Bitácora" widgets (`tieneBitacora()` in `lib/session.ts`): store selector, GPS-based report, PDF export. Coordinador and gerente are the "office" roles with broader read access across everyone's data.

### Data access

`lib/supabase-server.ts` creates a `service_role` Supabase client — bypasses RLS entirely, so it must **only** ever be imported from server code (Server Actions, Route Handlers), never a `"use client"` file; the key would otherwise ship to the browser. The client is typed against `lib/database.types.ts`, generated from the live schema via the Supabase MCP tools — regenerate it after any migration rather than hand-editing.

Server Actions live as `actions.ts` (or `*-actions.ts`) files colocated with the pages/components that call them, one per feature area (e.g. `app/panel/coordinador/actions.ts`, `app/panel/break-actions.ts`). There is no API layer between components and Supabase beyond these.

**`tiendas_permanentes`** (which stores are "fixed"/permanently assigned to which person) is soft-deleted: removing an assignment sets `fecha_fin` rather than deleting the row, so the table doubles as history. Any query against it for "current" assignments must filter `.is("fecha_fin", null)` — a query that doesn't is a bug (this has happened repeatedly across the codebase: display widgets, email-notification recipient lookups, and "is this your assigned store" authorization checks have all needed this fix). The one intentional exception is `obtenerRotacionTienda` in `app/panel/analitica/actions.ts`, which exists specifically to show full history.

### Peru timezone handling

All "what day/time is it" logic must go through `lib/fechas.ts`'s `hoyPeru()` / `horaPeru()` / `diaSemanaPeru()` etc., never `new Date()` directly. The helpers compute wall-clock Peru time (UTC-5) by offsetting `Date.now()` (an absolute epoch instant) and reading it back with UTC getters — not by adding `getTimezoneOffset()`, which is for reading with *local* getters and silently doubles the offset on a phone whose OS timezone is already Peru. `diaLaboralPeru()` additionally treats times before 6am as still "yesterday" for capacitador shift purposes (late-night store closings).

### Offline-first marcaciones

Field check-ins happen in stores with bad signal (underground parking, poor coverage). `lib/cola-marcaciones.ts` and `lib/cola-checklists.ts` queue failed submissions in `localStorage` and a `SincronizadorOffline` component (mounted in `PanelShell`) retries them once connectivity returns. Follow this pattern for any new "must not lose this if the network drops mid-save" flow rather than just showing an error.

### Photo storage

`lib/blob-storage.ts` is the only thing the rest of the app calls to store/read photos (marcaciones, historias, perfiles, evidencias, agenda) — it builds folder-prefixed paths and delegates to whichever provider `lib/almacen-fotos.ts` picks based on env vars (Cloudflare R2 preferred, Vercel Blob fallback), behind a shared `AlmacenFotos` interface. Photos are read via short-lived signed URLs, never public permanent ones. Don't call the R2/Vercel Blob SDKs directly from feature code.

### Sound, celebration, and seasonal theming

`lib/sonido.ts` synthesizes all UI sounds with WebAudio oscillators (no audio files); selectable "packs" are stored in `localStorage`. `reproducirSonidoLogro()` also dispatches a `shimaya:celebracion` window event that a single `Celebracion` component (mounted once in `PanelShell`) listens for to render falling-confetti particles — add new achievement sounds by calling the existing exported functions, not by inventing a parallel animation trigger.

October is gated app-wide by `esTemporadaHalloween()` in `lib/fechas.ts` (checks only the month) and layers in decorative/sound extras (menu icon glow, leaf/bat confetti instead of gold, a pumpkin favicon, a tap-to-spark greeting emoji, a once-daily "trick or treat" card, a reskinned mascot intro animation on `/login`) without altering any underlying logic — this is the template to follow for any other date-gated seasonal UI.

### PDF generation

`lib/generar-pdf.ts` centralizes jsPDF usage — shared header-drawing, field-drawing, page-width/color constants. Feature-specific PDF builders (checklist visits, no-cumplimiento reports, perfil) live in each area's own `*-pdf-actions.ts` / `pdf-actions.ts` and call into these shared helpers rather than reimplementing layout.

### Lazy-loaded panel sections

`app/panel/panel-lazy.tsx` wraps every heavy panel tab (Central Analítica, Documentos, Calendario, etc.) in `next/dynamic` with `ssr: false` and a shimmer skeleton, since most traffic is mobile. Add new heavy tabs here rather than importing them directly into a role's page/tabs file.

### Styling

Tailwind, but the actual color values are CSS custom properties in `app/globals.css` (`--marca-*`, plus a `--calabaza` seasonal accent) mapped into `tailwind.config.ts` as `rgb(var(--x) / <alpha-value>)` — this is what makes the `data-theme="light"` override in `globals.css` work. Add new brand/accent colors the same way (CSS var + Tailwind color entry) rather than hardcoding hex values, and respect `prefers-reduced-motion` (there's a dedicated block at the bottom of `globals.css` disabling/hiding every custom animation) when adding new CSS animations.
