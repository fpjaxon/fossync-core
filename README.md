# fossync

A Teleparty-style watch-party **sync engine**. It synchronizes playback *control
signals* (play / pause / seek) across viewers — it does **not** stream, store, or
proxy video. Everyone streams from the original site; fossync just keeps the
timeline aligned.

The sync core is service-agnostic: it drives any HTML5 `<video>` behind a small
adapter, so each site (the bundled test harness, YouTube, and more later) is just
another adapter.

## How it works

One **Cloudflare Durable Object per room** holds the authoritative playback state
as a *timeline anchor* (`at server-time T, media position was P, advancing at rate
R`) and acts as the shared reference clock + WebSocket fan-out. Each client
estimates its offset to that clock (Cristian's algorithm) and runs a ~250 ms
reconciliation loop that nudges `playbackRate` for small drift or hard-seeks for
large drift — targeting <250 ms steady-state alignment.

The **browser extension is the only control surface** — the web page stays pure
content. You start or join a room from the extension; a content script injects into
the page, syncs its `<video>`, and shows a small presence badge.

## Packages

- `packages/sync-core` — framework-agnostic, DOM-free sync logic: clock-offset
  math, reconciler, `SyncClient`, `SyncSession`, `Html5VideoAdapter`. Unit-tested
  with vitest.
- `packages/worker` — Cloudflare Worker + `RoomDurableObject` (authoritative
  timeline anchor, reference clock, WebSocket fan-out; SQLite-backed Durable
  Object). Room state is ephemeral — it is discarded once the last participant
  leaves. Tested with `@cloudflare/vitest-pool-workers`.
- `apps/extension` — WXT-based Firefox (MV2) extension: the popup ("Start Sync" →
  shareable invite link) plus per-site content scripts. Built on a reusable
  page-sync controller with one adapter per site (currently the test harness and
  YouTube).
- `apps/harness` — a minimal static page with a single `<video>`, used as a neutral
  site for testing sync.

## Develop

This is a pnpm workspace (pnpm 9). If you don't have pnpm: `npm i -g pnpm@9.7.0`.

```bash
pnpm install
pnpm -r test                     # unit tests across all packages
pnpm -F @fossync/worker dev      # run the worker locally on http://localhost:8787
pnpm -F @fossync/harness dev     # serve the harness on http://localhost:5173
pnpm -F @fossync/extension dev   # launch Firefox with the extension (HMR)
pnpm -F @fossync/extension zip   # build the installable .zip
```

## Browser extension

The popup creates or reflects a room and produces a shareable invite link
(`…#vsync=CODE`); a content script injects on supported pages, syncs the page's
`<video>` over the worker, and shows a presence badge. On YouTube it pauses syncing
during ads and resumes afterward. By default the extension connects to the deployed
backend at `wss://fossync.cloud`.

Supported pages today: the test harness and `youtube.com/watch`.

To load it unsigned for testing: build with `pnpm -F @fossync/extension zip`, then
in Firefox open `about:debugging` → **This Firefox** → **Load Temporary Add-on** and
select the built `.zip` under `apps/extension/.output/`.

## Try it (end-to-end)

Unit tests cover the sync math; the "do two tabs actually stay locked" check is
visual:

1. Load the extension (above).
2. Open the harness (`https://harness.fossync.cloud`, or your local `:5173`) or a
   `youtube.com/watch` video.
3. Open the fossync popup → **Start Sync** → copy the invite link.
4. Open that link in a second tab (or send it to someone else). Both tabs join the
   same room.
5. Play, pause, and seek in one tab. **Expected:** the other follows within a tick;
   steady-state drift settles under ~250 ms (small corrections are invisible rate
   nudges, large jumps are seeks).

The engine supports two control modes — anyone-can-control or host-only — and
transfers host status automatically when the host leaves.

## Deployment

- Worker: **https://fossync.cloud** (Cloudflare Workers + Durable Objects)
- Harness: **https://harness.fossync.cloud**

## Deferred

Chat; more streaming-service adapters (Netflix / Disney+ / Max — DRM makes these
harder); optional anonymous accounts; "wait-for-slowest" buffering; following the
host to a different video.

## License

fossync is available to the public under the [PolyForm Noncommercial License
1.0.0](./LICENSE): any noncommercial purpose is permitted. Commercial use rights
are reserved exclusively by Floatpoint, LLC — for commercial licensing, contact
jaxon@floatpoint.net.
