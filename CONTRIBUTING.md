# Contributing to fossync

Thanks for your interest in fossync. It's a watch-party engine that keeps everyone's
play, pause, and seek in sync — and most of what makes it better comes from people who
want one more site to work, one less bug, or one clearer doc. Contributions of all
sizes are welcome.

fossync is **source-available** under the
[PolyForm Noncommercial License 1.0.0](./LICENSE): you may use, modify, and share it for
any noncommercial purpose. It is not a typical open-source project, so please read the
[Contributor terms](#contributor-terms) below before you send a change — they're short
and they matter.

## Ways to contribute

- **Add a site.** The highest-leverage contribution. Most streaming sites are a few
  lines away from working — see [Add a new site](#add-a-new-site).
- **Report a bug** or **request a feature** using the
  [issue templates](https://github.com/fpjaxon/fossync-core/issues/new/choose).
- **Fix a bug** or **improve sync accuracy, UX, or the relay.**
- **Improve the docs**, including this guide.

If you're planning a larger change, open an issue first so we can talk through the
approach before you spend time on it.

## Contributor terms

fossync is free for any noncommercial use, and that includes contributing — you never
need permission or a fee to send a fix or a new site. There's one thing to understand
before you do, though, because it keeps the project sustainable.

**By submitting a contribution (a pull request, patch, or any change), you agree that
Floatpoint, LLC may use, modify, sublicense, and relicense it — including
commercially, as part of the fossync Cloud product — and you confirm you have the right
to grant this.** You keep the copyright to your own work; you're granting Floatpoint a
broad license to it, not signing it away.

We ask for this because fossync's commercial rights are reserved to Floatpoint, LLC
(that's what funds the work). If contributions came in under a noncommercial-only
license, we couldn't include them in the product we actually run, and the project
couldn't sustain itself.

**Not comfortable with that?** That's completely fair, and you have a good option: fork
fossync and self-host your changes. We genuinely support that — self-hosting is
encouraged, and the extension is built to point at any relay you run. Just keep in mind
that a fork is still fossync's code under PolyForm Noncommercial, so the same terms
apply to it: your changes aren't yours to sell or run commercially either, by you or by
us, without a commercial license. The noncommercial freedom is fully yours; the
commercial rights stay with Floatpoint on both sides.

Commercial-use or licensing questions: see [fossync.com/licensing](https://fossync.com/licensing)
or email <jaxon@floatpoint.net>.

## Project layout

fossync is a [pnpm](https://pnpm.io) workspace (a monorepo):

- **`packages/sync-core`** — the framework-agnostic, DOM-free sync logic: clock-offset
  math, the reconciler, `SyncClient`, `SyncSession`, and `Html5VideoAdapter`.
- **`packages/worker`** — the Cloudflare Worker and its Durable Objects.
  `RoomDurableObject` is the authoritative timeline anchor, reference clock, and
  WebSocket fan-out; `RoomRegistry` caps concurrent rooms.
- **`apps/extension`** — the WXT-based Firefox (MV2) extension: the popup, a reusable
  page-sync controller, the in-page sidebar, and one **site module** per supported site.
- **`apps/harness`** — a minimal static page with a single `<video>`, used as a neutral
  site for testing sync.

There's more background in the [README](./README.md).

## Development setup

You'll need [Node.js](https://nodejs.org) and **pnpm 9**. If you don't have pnpm:

```bash
npm i -g pnpm@9.7.0
```

Then, from the repo root:

```bash
pnpm install                     # install all workspace dependencies
pnpm -r test                     # run unit tests across every package
pnpm -r typecheck                # type-check every package
```

Run individual pieces while you work:

```bash
pnpm -F @fossync/worker dev      # the relay locally on http://localhost:8787
pnpm -F @fossync/harness dev     # the test harness on http://localhost:5173
pnpm -F @fossync/extension dev   # launch Firefox with the extension (HMR)
pnpm -F @fossync/extension zip   # build an installable .zip
```

### Loading the extension for testing

Build it with `pnpm -F @fossync/extension zip`, then in Firefox open `about:debugging` →
**This Firefox** → **Load Temporary Add-on**, and pick the built `.zip` under
`apps/extension/.output/`. (Unsigned builds must be loaded this way; `about:addons`
rejects them as "corrupt".)

> **Heads up:** other watch-party extensions (notably Teleparty) hook the same
> `<video>` element and will fight with fossync, making video stall or "fail to load."
> Disable them while testing.

## Add a new site

This is the most common — and most welcome — contribution, and it's small. Each site is
a `SiteModule` (defined in `apps/extension/src/page-sync.ts`) plus a thin content-script
entrypoint. Everything else — rooms, the sync engine, the sidebar, chat — is shared.

A `SiteModule` needs one method and has two optional ones:

- **`findVideo()`** (required) — return the page's `<video>` element. Most sites load
  their player asynchronously, so this usually polls until the element appears.
- **`watchAds(video, onAd)`** (optional) — call `onAd(true/false)` as ads start and
  stop, so sync pauses during ads. See `youtube.ts`.
- **`watchNavigation(onNavigate)`** (optional) — for single-page-app sites that swap
  videos without a reload (e.g. next episode), call `onNavigate(url)` so the room can
  follow. See `crunchyroll.ts`.

The two shipped modules are short, worked examples — start by copying the closest one:

- [`apps/extension/src/sites/youtube.ts`](./apps/extension/src/sites/youtube.ts) — polls
  for the player and reports ad state.
- [`apps/extension/src/sites/crunchyroll.ts`](./apps/extension/src/sites/crunchyroll.ts)
  — a DRM (Bitmovin/Widevine) player and SPA episode navigation. **DRM is not a
  blocker:** it protects the media *stream*, not the `<video>` element's timeline API,
  so control-signal sync works normally.

Roughly:

1. Add `apps/extension/src/sites/<yoursite>.ts` exporting a `SiteModule`.
2. Wire a thin content-script entrypoint that registers it for the site's URLs, matching
   the existing entrypoints.
3. Add the host match pattern to the extension manifest config (`wxt.config.ts`).
4. Test it with the [two-tab check](#verifying-sync-end-to-end) on a real page.

Remember the core principle: fossync **drives the site's own player and never streams,
stores, or proxies video**. A site module only locates the player and reports ad/nav
state.

## Conventions

- **TypeScript throughout.** Imports are explicit (the extension doesn't use WXT
  auto-imports) — import what you use.
- **Keep `sync-core` DOM-free** and framework-agnostic. Anything that touches the page
  belongs in the extension, behind an adapter.
- **Render user content with `textContent`,** never `innerHTML`. Chat and names are
  untrusted; keep them XSS-safe.
- **Match the surrounding style.** Don't reformat unrelated code.

## Testing

- **Unit tests** run on [Vitest](https://vitest.dev): `pnpm -r test`. The sync math in
  `sync-core` is covered by unit tests — add to them when you change that logic.
- **The relay** can be smoke-tested over a real WebSocket:
  ```bash
  node --experimental-websocket packages/worker/scripts/ws-smoke.mjs wss://fossync.cloud/room/SMOKE
  ```

### Verifying sync end-to-end

The real test of a sync change is two tabs staying locked together:

1. Load the extension (see above) and open the harness, a YouTube watch page, or a
   Crunchyroll episode.
2. Open the fossync popup, choose **Start Sync**, and copy the invite link.
3. Open that link in a second tab (or send it to a friend). Both join the same room.
4. Play, pause, and seek in one tab. The other should follow within a tick, with
   steady-state drift settling under ~250 ms. Small corrections are invisible rate
   nudges; large jumps are seeks.

(And again: disable Teleparty and friends while testing.)

## Submitting a pull request

1. Branch off `main`.
2. Make your change, and run `pnpm -r test` and `pnpm -r typecheck` — both should pass.
3. Use clear, focused commits. This repo uses conventional-commit style, e.g.
   `feat(extension): add vimeo site module` or `fix(worker): release room on disconnect`.
4. Open the PR and fill out the template. By opening it, you agree to the
   [Contributor terms](#contributor-terms).

We'll review as soon as we can. Smaller, focused PRs land faster.

## Reporting security issues

Please don't open public issues for vulnerabilities. See [SECURITY.md](./SECURITY.md)
for how to report them privately.
