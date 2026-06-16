# fossync

fossync is a watch-party synchronization engine in the style of Teleparty. It keeps
video playback aligned across viewers by synchronizing control signals (play, pause,
and seek). It **does not stream, store, or proxy video**: everyone streams from the
original site, and fossync only keeps the timeline aligned.

The sync core is service-agnostic. It drives any HTML5 `<video>` element through a
small adapter, so each supported site is simply another adapter.

fossync Cloud is live at [fossync.cloud](https://fossync.cloud), and the project
website is at [fossync.com](https://fossync.com).

## Install (Firefox)

fossync is self-distributed: signed by Mozilla but not listed on AMO. Install it in
Firefox from a single link:

**https://fossync.cloud/latest.xpi** — Firefox will prompt "Add fossync?"; click **Add**.

The add-on persists across restarts and auto-updates itself within a day of each
release.

## How it works

A single Cloudflare Durable Object per room holds the authoritative playback state as
a timeline anchor: at server time T, the media position was P, advancing at rate R.
The Durable Object also serves as the shared reference clock and the WebSocket fan-out
point. Each client estimates its offset to that clock using Cristian's algorithm and
runs a reconciliation loop (roughly every 250 ms) that nudges `playbackRate` to
correct small drift and performs a hard seek to correct large drift, targeting
steady-state alignment under 250 ms.

The browser extension is the only control surface; the web page itself stays pure
content. A viewer starts or joins a room from the extension. A content script then
injects into the page, synchronizes its `<video>` element, and renders an in-page
sidebar for presence, activity, and chat.

## Architecture

fossync is a pnpm workspace (a monorepo) with the following packages:

- `packages/sync-core`: framework-agnostic, DOM-free sync logic, including the
  clock-offset math, the reconciler, `SyncClient`, `SyncSession`, and
  `Html5VideoAdapter`. Unit-tested with Vitest.
- `packages/worker`: the Cloudflare Worker and its Durable Objects.
  `RoomDurableObject` is the authoritative timeline anchor, reference clock, and
  WebSocket fan-out (SQLite-backed). `RoomRegistry` enforces a global cap on
  concurrent active rooms. Tested with `@cloudflare/vitest-pool-workers`.
- `apps/extension`: the WXT-based Firefox (MV2) extension. It contains the popup, a
  reusable page-sync controller, the in-page sidebar, and one adapter per supported
  site.
- `apps/harness`: a minimal static page with a single `<video>` element, used as a
  neutral site for testing sync.

## Supported sites

- The bundled test harness.
- YouTube watch pages (`youtube.com/watch`), with syncing paused during ads and
  resumed afterward.
- Crunchyroll episodes (`crunchyroll.com/watch/...`), including following the host
  across episode changes.

Room state is ephemeral by design. `RoomDurableObject` discards its persisted record
once the last participant leaves, so fossync Cloud retains no room data beyond an
active session.

## The extension

The extension is the control surface for a watch party:

- The popup starts a room and rewrites the current tab's URL to a shareable invite
  link (`…#vsync=CODE`).
- A content script injects on supported pages, synchronizes the page's `<video>` over
  the relay, and renders a collapsible in-page sidebar.
- The sidebar shows the participant list, a live activity feed (joins, leaves, and
  play/pause/seek events with timecodes), live chat, and emoji reactions. Chat and
  reactions are relayed in real time and are never stored.
- When a viewer joins, browser autoplay policies can block programmatic playback. The
  extension shows a one-click "Click to watch in sync" gate over the video so the
  joiner starts playing in sync.
- The engine supports two control modes, anyone-can-control and host-only, and
  transfers host status automatically when the host leaves.
- An optional **encrypted session** toggle turns on end-to-end encryption: chat,
  reactions, names, the content URL, and playback are encrypted client-side so the
  relay only ever relays opaque blobs and can't read them. A random key is minted at
  start and carried in the invite link's fragment (`…#vsync=CODE&k=…`), which
  browsers never send to a server — so even a relay running modified code can't read
  the content. It trades away history/forward secrecy and leaks some metadata
  (timing, participant count); see [SECURITY.md](./SECURITY.md) for the threat model.

## Self-hosting and custom relays

fossync Cloud (`fossync.cloud`) is the default relay, but the relay is just the worker
in `packages/worker` and can be self-hosted on any Cloudflare account. The worker
exposes two routes:

- `GET /new` allocates a room code, and returns `503 {"error":"at_capacity"}` once the
  global cap of 20 concurrent active rooms is reached. CORS is open so any relay's
  `/new` is reachable from the extension popup.
- `GET /room/:code` is the WebSocket endpoint that a room's clients connect to.

To point the extension at a different relay, open the extension settings (the gear
icon) and enter the relay URL. When the configured relay is not the official one, the
sidebar shows a persistent warning: a relay operator can see the room and your IP
address and can control playback. A relay never receives credentials, and it cannot
redirect viewers off-site or execute code in the page.

## Development

This is a pnpm workspace (pnpm 9). If you do not have pnpm installed, run
`npm i -g pnpm@9.7.0`.

```bash
pnpm install
pnpm -r test                     # unit tests across all packages
pnpm -F @fossync/worker dev      # run the worker locally on http://localhost:8787
pnpm -F @fossync/harness dev     # serve the harness on http://localhost:5173
pnpm -F @fossync/extension dev   # launch Firefox with the extension (HMR)
pnpm -F @fossync/extension zip   # build the installable .zip
```

### Loading the extension

To load the extension unsigned for testing, build it with
`pnpm -F @fossync/extension zip`. Then, in Firefox, open `about:debugging`, choose
**This Firefox**, choose **Load Temporary Add-on**, and select the built `.zip` under
`apps/extension/.output/`.

Note that other watch-party extensions (such as Teleparty) hook the same `<video>`
element and will conflict with fossync. Disable them while testing.

### Verifying sync end-to-end

Unit tests cover the sync math. The visual check that two tabs stay locked together is:

1. Load the extension as described above.
2. Open the harness (`https://harness.fossync.cloud`, or your local
   `http://localhost:5173`), a YouTube watch page, or a Crunchyroll episode.
3. Open the fossync popup, choose **Start Sync**, and copy the invite link.
4. Open that link in a second tab, or send it to another viewer. Both tabs join the
   same room.
5. Play, pause, and seek in one tab. The other tab should follow within a tick, and
   steady-state drift should settle under roughly 250 ms. Small corrections are
   invisible rate nudges; large jumps are seeks.

### Releasing a new version

1. Bump `version` in `apps/extension/package.json`.
2. Export AMO API credentials (see `apps/extension/.env.example`):
   ```bash
   export AMO_JWT_ISSUER=… AMO_JWT_SECRET=…
   ```
3. From `apps/extension`, run `pnpm release`.

This builds the extension, signs it unlisted via the AMO API (automated, no review
queue), and uploads the signed `.xpi` and regenerated `updates.json` to the
`fossync-builds` R2 bucket. Installed clients pick up the update automatically.

## Deployment

- Relay (worker): [fossync.cloud](https://fossync.cloud), on Cloudflare Workers and
  Durable Objects.
- Harness: [harness.fossync.cloud](https://harness.fossync.cloud).
- Project website: [fossync.com](https://fossync.com).

## Privacy

fossync synchronizes control signals only and does not stream or store video. Room
state is ephemeral, chat and reactions are relayed without being stored, and display
names are stored locally and are never persisted on the server. See
[PRIVACY.md](./PRIVACY.md) for the full policy.

## Roadmap

- Additional streaming-service adapters (Netflix, Disney+, Max), where DRM makes
  integration harder.
- Generalizing content and episode sync beyond Crunchyroll, such as following the host
  to the next YouTube video.
- A `fossync.cloud/join/CODE` share-link model.
- Optional anonymous accounts and wait-for-slowest buffering.

## License

fossync is available to the public under the
[PolyForm Noncommercial License 1.0.0](./LICENSE): any noncommercial purpose is
permitted. Commercial use rights are reserved exclusively by Floatpoint, LLC. For
commercial licensing, contact jaxon@floatpoint.net.

## Credits

The animated reaction emoji are derived from
[Noto Animated Emoji](https://googlefonts.github.io/noto-emoji-animation/) by Google,
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See
[NOTICE](./NOTICE) for attribution.
