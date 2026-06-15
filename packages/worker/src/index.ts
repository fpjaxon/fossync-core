import { RoomDurableObject } from "./room-do";

export { RoomDurableObject };

export interface Env {
  ROOM: DurableObjectNamespace;
}

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars

function genCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/new") {
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
