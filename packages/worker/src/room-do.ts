export class RoomDurableObject {
  constructor(private ctx: DurableObjectState, private env: unknown) {}
  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    return new Response("not implemented", { status: 501 });
  }
}
