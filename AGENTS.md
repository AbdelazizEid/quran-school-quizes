## Agent skills

### Issue tracker

Issues live in GitHub Issues and are managed with `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

This repo uses the default triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo with root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.

## Test workflow

### e2e server

`npm run test:e2e` manages its own dev server (Playwright `webServer`) started with `CLERK_SECRET_KEY=placeholder`, which enables the dev-teacher fallback instead of real Clerk auth. Do not start, stop, or restart dev servers by hand for e2e runs. If port 3000 is held by a server Playwright did not start, stop that server first — a real-key server on the port makes every API test return 401.

### Hydration-aware specs

Pages are client components and compile on demand in dev. Clicking before React hydrates silently loses the handler. In e2e specs, after `goto` on a page (or client-side navigation to a cold route), `await page.waitForLoadState("networkidle")` before the first meaningful click, and allow `{ timeout: 15000 }` for the first heading on cold routes.

### Verification economy

During implementation, run only the focused spec files and unit tests touched by the change. Run the full gate (`npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test:e2e`) once at the end of the slice, not after every edit. If a full-gate e2e failure looks unrelated to the change, reproduce it on the clean tree (stash, rerun, unstash) before treating it as a regression.
