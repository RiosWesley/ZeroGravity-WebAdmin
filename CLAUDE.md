# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Next.js dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run lint` — run ESLint (flat config, `eslint.config.mjs`)

No test framework is configured.

## Architecture

This is a **Next.js 16** (App Router) admin dashboard for managing a **ZeroGravity** LLM proxy that runs inside a Docker container named `zerogravity`. The app uses plain JavaScript (no TypeScript), vanilla CSS, and React 19.

### Key layers

- **`src/lib/docker.js`** — Core Docker integration via `dockerode`. Connects to the local Docker socket (`/var/run/docker.sock`) to manage the `zerogravity` container (start/stop/restart, inspect status, fetch logs, exec CLI commands). Contains `parseMuxedStream()` for stripping Docker multiplexed stream headers and ANSI codes from log output.
- **`src/lib/accounts.js`** — Reads/writes the ZeroGravity accounts file at `~/.config/zerogravity/accounts.json`. Structure: `{ accounts: [{email, refresh_token, extracted_at}], active: "email" }`.
- **`src/components/Dashboard.js`** — Single large client component (`'use client'`) that renders the entire UI: sidebar navigation, container controls, accounts management, log viewer with parsing/analysis, and model listing. Contains inline SVG icons and a `parseLogs()` function that extracts structured stats from raw ZeroGravity log text.

### API routes (all under `src/app/api/`)

| Route | Method | Purpose |
|---|---|---|
| `/api/status` | GET | Container status + proxy health check (hits `localhost:8741/v1/models`) |
| `/api/action` | POST | Container lifecycle: `{action: "start"|"stop"|"restart"}` |
| `/api/logs` | GET | Fetch container logs (query param `?tail=N`) |
| `/api/accounts` | GET | Read accounts from JSON file |
| `/api/accounts` | POST | Account management: `{action: "set"|"remove", payload: {email}}` — executes `zg` CLI commands inside the container |

### Important details

- Path alias: `@/*` maps to `./src/*` (configured in `jsconfig.json`)
- `dockerode`, `ssh2`, and `cpu-features` are listed in `serverExternalPackages` in `next.config.mjs` to avoid bundling issues
- Fonts: Sora (headings), DM Sans (body), JetBrains Mono (code) — loaded via Google Fonts in `layout.js`
- CSS variables prefixed with `--zg-*` define the design system (see `globals.css`)
- The dashboard polls `/api/status` and `/api/logs` every 5 seconds for live updates
- The ZeroGravity proxy API runs on port 8741 inside the container
