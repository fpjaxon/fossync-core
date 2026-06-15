// Singleton Durable Object that tracks how many rooms are currently active, so the
// worker can enforce a global session cap. Rooms call /acquire when someone is in
// them and /release when they empty. Each entry carries a last-seen timestamp and
// is pruned after a TTL, so a room that dies without releasing can't leak a slot
// forever (the failure mode is under-counting — letting a few extra rooms in —
// never over-counting and locking everyone out).
const STALE_MS = 12 * 60 * 60 * 1000; // 12h — far longer than any real session

export class RoomRegistry {
  private active = new Map<string, number>(); // roomId -> last-seen (ms)

  constructor(private readonly ctx: DurableObjectState) {
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<[string, number][]>("active");
      if (saved) this.active = new Map(saved);
    });
  }

  private prune(now: number): void {
    for (const [id, seen] of this.active) if (now - seen > STALE_MS) this.active.delete(id);
  }

  async fetch(req: Request): Promise<Response> {
    const { pathname } = new URL(req.url);
    const now = Date.now();
    this.prune(now);

    if (pathname === "/acquire" || pathname === "/release") {
      const room = ((await req.json()) as { room?: unknown }).room;
      if (typeof room === "string" && room) {
        if (pathname === "/acquire") this.active.set(room, now);
        else this.active.delete(room);
        await this.ctx.storage.put("active", [...this.active]);
      }
    }

    return Response.json({ count: this.active.size });
  }
}
