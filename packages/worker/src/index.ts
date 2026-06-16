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
