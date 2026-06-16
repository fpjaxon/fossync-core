import { RoomDurableObject } from "./room-do";
import { RoomRegistry } from "./registry-do";
import { pickLatest, type UpdatesManifest } from "./updates";

export { RoomDurableObject, RoomRegistry };

/** Global cap on concurrent active rooms; beyond this, /new returns 503. */
export const MAX_ROOMS = 20;

export interface Env {
  ROOM: DurableObjectNamespace;
  REGISTRY: DurableObjectNamespace;
  BUILDS: R2Bucket;
}

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars

function genCode(): string {
  // Rejection-sample to avoid modulo bias (256 is not a multiple of 31).
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  const out: string[] = [];
  while (out.length < 6) {
    const buf = new Uint8Array(6);
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b >= limit) continue;
      out.push(ALPHABET[b % ALPHABET.length]!);
      if (out.length === 6) break;
    }
  }
  return out.join("");
}

function registry(env: Env): DurableObjectStub {
  return env.REGISTRY.get(env.REGISTRY.idFromName("global"));
}

// Passive landing page served at /j for a branded invite. The real destination,
// room code, and any encrypted-session key live in the URL *fragment* (see
// @fossync/sync-core/branded), which browsers never put in the HTTP request — so
// this worker receives only the bare GET /j and learns nothing about where the
// visitor is going.
//
// The redirect itself is NOT done here: the fossync extension's /j content script
// reads the fragment and navigates. Resolution lives in the extension on purpose,
// so the official build only ever follows fossync.cloud/j (its WORKER_ORIGIN) and
// never a branded link pointing at some other relay. This page is just what a
// visitor WITHOUT the extension sees — a nudge to install it.
const JOIN_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>fossync</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: #0e0e12; color: #e7e7ee;
         font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 32rem; padding: 2rem; text-align: center; }
  h1 { margin: 0 0 .75rem; font-size: 1.6rem; letter-spacing: -0.02em; }
  p { color: #a9a9b8; }
  a.btn { display: inline-block; margin-top: 1rem; padding: .6rem 1.1rem; border-radius: 8px;
          background: #25925c; color: #eafff2; text-decoration: none; font-weight: 600; }
</style>
</head>
<body>
<main>
  <h1>fossync</h1>
  <p id="msg">Opening your watch party…</p>
  <p>This invite opens in the fossync extension. If nothing happens, you don't have it yet:</p>
  <p><a class="btn" href="/latest.xpi">Get the extension</a></p>
</main>
</body>
</html>`;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // A browser hitting the bare API domain → the marketing site. The API routes
    // below (/new, /room/:code) use their own paths and are unaffected.
    if (url.pathname === "/") {
      return Response.redirect("https://fossync.com/", 302);
    }

    if (url.pathname === "/new") {
      // Public, side-effect-light endpoint — allow cross-origin so the extension
      // popup can reach a self-hosted relay's /new without a host permission.
      const cors = { "Access-Control-Allow-Origin": "*" };
      const res = await registry(env).fetch("https://registry/count");
      const { count } = (await res.json()) as { count: number };
      if (count >= MAX_ROOMS) {
        return Response.json({ error: "at_capacity" }, { status: 503, headers: cors });
      }
      return Response.json({ code: genCode() }, { headers: cors });
    }

    // Branded invite landing page. The destination lives in the fragment (never
    // sent here); the extension's /j content script reads it and redirects. This
    // fixed page is only the fallback a visitor without the extension sees.
    if (url.pathname === "/j") {
      return new Response(JOIN_PAGE, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          // The extension redirects from this document; keep fossync.cloud out of
          // the referrer the destination site receives.
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // --- Self-hosted extension distribution (R2 bucket: fossync-builds) ---
    // See docs/superpowers/specs/2026-06-15-self-hosted-extension-updates-design.md.

    if (url.pathname === "/updates.json") {
      const obj = await env.BUILDS.get("updates.json");
      if (!obj) return new Response("not found", { status: 404 });
      return new Response(obj.body, {
        headers: {
          "Content-Type": "application/json",
          // Short TTL so new releases reach clients quickly.
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    const xpi = url.pathname.match(/^\/download\/(fossync-\d+\.\d+\.\d+\.xpi)$/);
    if (xpi) {
      const obj = await env.BUILDS.get(xpi[1]!);
      if (!obj) return new Response("not found", { status: 404 });
      return new Response(obj.body, {
        headers: {
          // application/x-xpinstall makes Firefox offer to install rather than
          // download the file.
          "Content-Type": "application/x-xpinstall",
          // Versioned filename never changes — cache hard.
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    if (url.pathname === "/latest.xpi") {
      const obj = await env.BUILDS.get("updates.json");
      if (!obj) return new Response("not found", { status: 404 });
      const link = pickLatest((await obj.json()) as UpdatesManifest);
      if (!link) return new Response("not found", { status: 404 });
      // update_link is operator-supplied via the R2 manifest (written by our
      // release script) — not user input, so no scheme/origin check is needed.
      return Response.redirect(link, 302);
    }

    const m = url.pathname.match(/^\/room\/([A-Za-z0-9]+)$/);
    if (m) {
      const code = m[1]!.toUpperCase();
      const stub = env.ROOM.get(env.ROOM.idFromName(code));
      return stub.fetch(req);
    }

    return new Response("not found", { status: 404 });
  },
};
