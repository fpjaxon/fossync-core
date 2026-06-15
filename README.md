# video-sync

A Teleparty-style watch-party **sync engine**. It synchronizes playback *control
signals* (play / pause / seek) across viewers — it does **not** stream video. v1
proves the sync core against a plain HTML5 `<video>` behind a service-agnostic
adapter, so each real streaming service (Netflix/Disney+/Max, which require a
browser extension) later becomes just another adapter.

## How it works

One **Cloudflare Durable Object per room** holds the authoritative playback state
as a *timeline anchor* (`at server-time T, media position was P, advancing at rate
R`) and acts as the shared reference clock + WebSocket fan-out. Each client
estimates its offset to that clock (Cristian's algorithm) and runs a ~250 ms
reconciliation loop that nudges `playbackRate` for small drift or hard-seeks for
large drift — targeting <250 ms steady-state alignment.

## Packages

- `packages/sync-core` — framework-agnostic, DOM-free sync logic: clock-offset
  math, reconciler, `SyncClient`, `SyncSession`, `Html5VideoAdapter`. Unit-tested
  with vitest.
- `packages/worker` — Cloudflare Worker + `RoomDurableObject` (authoritative
  timeline anchor, reference clock, WebSocket fan-out; SQLite-backed for free-plan
  hibernation economics). Tested with `@cloudflare/vitest-pool-workers`.
- `apps/harness` — Vite page for multi-tab manual verification.

## Develop

> **Toolchain note:** this repo uses standalone **pnpm 9.7.0** with Corepack
> disabled (Corepack is broken on the Node 20.19 in this environment). Install
> with `npm i -g pnpm@9.7.0` if you don't already have pnpm.

```bash
pnpm install
pnpm -r test                       # all unit tests (sync-core + worker)
pnpm -F @video-sync/worker dev     # backend on http://localhost:8787
pnpm -F @video-sync/harness dev    # harness on http://localhost:5173
```

## Firefox extension (staging)

A WXT-based Firefox extension whose popup runs a live `SyncClient` (proving
`sync-core` bundles + runs in an extension) and can open the harness in the same
room. It does **not** yet inject into streaming sites — that's the next phase.

```bash
pnpm -F @video-sync/extension dev     # launches Firefox with the extension (HMR)
pnpm -F @video-sync/extension build   # bundles to apps/extension/.output/firefox-mv2/
```

Manual check (with the worker on :8787 and harness on :5173 running): open the
toolbar popup → **New** / **Connect** → the panel shows a live `offset (ms)` and
participant list → **Open harness** opens a tab in the same room; playing/seeking
in the harness is reflected in the popup's playback stats.

## Manual end-to-end check (requires a browser)

The distributed sync correctness is covered by unit tests, but the "do two tabs
actually stay locked on a real video" check is inherently visual:

1. Start the backend (`:8787`) and the harness (`:5173`) as above.
2. Open `http://localhost:5173/?room=TEST01` in **two** browser tabs.
3. Give each a distinct name, then click **Join** in both. Wait until each
   overlay shows a numeric `offset(ms)` and lists both participants.
4. Press play in one tab and let it run; seek backward.
   **Expected:** the other tab follows within one tick; steady-state `error(ms)`
   settles to **< 250** (small corrections are invisible rate nudges; large jumps
   are seeks).
5. Click **Toggle control mode** until `controlMode: host`, then try to play/seek
   in the non-host tab. **Expected:** it's rejected (console logs
   `server error: not authorized to control`).
6. Close the host tab. **Expected:** the remaining tab becomes `host`.

## Design & plan

- Spec: `docs/superpowers/specs/2026-06-14-video-sync-engine-design.md`
- Implementation plan: `docs/superpowers/plans/2026-06-14-video-sync-engine.md`

## Deferred (not in v1)

Chat; real streaming-service adapters + browser-extension packaging; user
accounts; "wait-for-slowest" buffering; freezing the playback anchor when a room
empties (a joiner to a long-idle room that was left playing will hard-seek to the
clamped end until someone issues a fresh control).
