# Security Policy

We take security and privacy seriously — fossync is built so that a watch party never
exposes more than it has to. If you find a vulnerability, thank you for helping keep it
that way.

## Reporting a vulnerability

**Please report security or privacy issues privately. Don't open a public GitHub
issue.**

- Email **<jaxon@floatpoint.net>** with the details, or
- Use GitHub's [private vulnerability reporting](https://github.com/fpjaxon/fossync-core/security/advisories/new)
  if it's enabled on the repo.

Please include enough to reproduce it: what you did, what happened, and the impact you
see. If you have a proof of concept, even better.

We'll acknowledge your report within a few days and keep you posted as we work on a fix.
fossync is a small project — there's no paid bug-bounty program — but we're grateful for
responsible disclosure and happy to credit you when a fix ships, if you'd like.

## Supported versions

- **Extension** — only the latest release is supported. It's distributed signed and
  self-updating (from `fossync.cloud/latest.xpi`) and pulls updates automatically within
  about a day, so security fixes reach everyone on the official build quickly.
- **Relay (worker)** — fossync Cloud always runs the latest `main`. If you self-host,
  please track `main` so you have current fixes.

## What fossync does and doesn't expose

Some context on the threat model, so reports can be scoped well. fossync syncs **control
signals only** (play, pause, seek) and never streams, stores, or proxies video.

- **Rooms are ephemeral.** `RoomDurableObject` deletes its persisted record once the
  last participant leaves, so the official cloud keeps no room data beyond an active
  session.
- **Chat and reactions are relayed in real time and never stored.** Display names are
  kept locally and aren't persisted server-side.
- **Relays are trusted infrastructure.** A relay operator (including a self-hosted or
  third-party one) can see a room's activity — who's connected, the media being synced,
  and chat — and your IP address, and can drive playback. The extension flags any
  non-official relay so you always know where you're connected.
- **A malicious relay cannot** run code in your browser, redirect you off-site, or read
  your accounts, cookies, or credentials. User-supplied content is rendered with
  `textContent`, and cross-site episode follows are restricted to the same origin.

For the full privacy details, see [PRIVACY.md](./PRIVACY.md). For more about relays and
self-hosting trade-offs, see [fossync.com](https://fossync.com/#selfhost).
