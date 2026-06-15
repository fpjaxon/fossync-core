import { RoomDurableObject } from "./room-do";
import { RoomRegistry } from "./registry-do";

export { RoomDurableObject, RoomRegistry };

/** Global cap on concurrent active rooms; beyond this, /new returns 503. */
export const MAX_ROOMS = 20;

export interface Env {
  ROOM: DurableObjectNamespace;
  REGISTRY: DurableObjectNamespace;
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
      const res = await registry(env).fetch("https://registry/count");
      const { count } = (await res.json()) as { count: number };
      if (count >= MAX_ROOMS) {
        return Response.json({ error: "at_capacity" }, { status: 503 });
      }
      return Response.json({ code: genCode() });
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
