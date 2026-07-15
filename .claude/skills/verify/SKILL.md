---
name: verify
description: Build/launch/drive recipe for verifying changes in the Ignis admin app at its browser surface.
---

# Verifying Ignis changes

## Launch

- `bun run dev` serves on **http://localhost:3000**. The user often already
  has a dev server running from this directory — a second `next dev` exits
  with code 1 ("Another next dev server is already running"). **Reuse the
  running server** (it hot-reloads your edits); don't kill PID on port 3000.
- The app is gated by an admin password form. Read the password from the
  `ADMIN_PASSWORD` entry in `.env.local` (never hardcode it). Fill the
  "Password" field, click "Sign in"; the session cookie persists for the
  browser context.

## Drive (browser)

- No Playwright in project deps. Use **Node, not Bun** — Bun on Windows hangs
  on Playwright's `--remote-debugging-pipe` launch handshake (180s timeout).
- `playwright-core` 1.61.x is installed at `C:\Users\Danilo\node_modules`
  (resolvable from anywhere under the user profile). Browsers live in
  `%LOCALAPPDATA%\ms-playwright\`.
- Launch with the **headless shell**, not full chrome.exe:
  `chromium_headless_shell-<rev>/chrome-headless-shell-win64/chrome-headless-shell.exe`
  passed as `executablePath` to `chromium.launch()`.
- Write the driver as a `.mjs` script in the scratchpad; screenshot to a
  `shots/` folder and Read the images to review.

## Gotchas

- Selectors: sidebar section headers and their action buttons share accessible
  names — use `{ exact: true }` with `getByRole`.
- The Next.js dev-tools badge (bottom-left "N" circle) overlaps the sidebar
  footer in screenshots; it's dev-only, not a layout bug.
- DB may be unreachable; the admin layout falls back to empty sidebar lists,
  so the shell still renders.
