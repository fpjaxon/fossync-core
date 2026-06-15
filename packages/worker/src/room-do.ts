import type {
  ClientMessage,
  ControlMode,
  Participant,
  Playback,
  RoomSnapshot,
  ServerMessage,
} from "@video-sync/sync-core";

interface Attachment {
  id: string;
  name: string;
  role: "host" | "guest";
}

interface PersistedRoom {
  playback: Playback;
  controlMode: ControlMode;
  hostId: string | null;
}

export class RoomDurableObject {
  private playback: Playback;
  private controlMode: ControlMode = "everyone";
  private hostId: string | null = null;

  constructor(private readonly ctx: DurableObjectState, private readonly env: unknown) {
    this.playback = { paused: true, anchorMediaTime: 0, anchorServerTime: Date.now(), rate: 1 };
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<PersistedRoom>("room");
      if (saved) {
        this.playback = saved.playback;
        this.controlMode = saved.controlMode;
        this.hostId = saved.hostId;
      }
    });
  }

  private async persist(): Promise<void> {
    const room: PersistedRoom = {
      playback: this.playback,
      controlMode: this.controlMode,
      hostId: this.hostId,
    };
    await this.ctx.storage.put("room", room);
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    const attachment: Attachment = { id: crypto.randomUUID(), name: "", role: "guest" };
    server.serializeAttachment(attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  private participants(exclude?: WebSocket): Participant[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws !== exclude)
      .map((ws) => {
        const a = ws.deserializeAttachment() as Attachment;
        return { id: a.id, role: a.role, name: a.name };
      });
  }

  private snapshot(): RoomSnapshot {
    return {
      controlMode: this.controlMode,
      hostId: this.hostId ?? "",
      playback: this.playback,
      participants: this.participants(),
    };
  }

  private broadcast(msg: ServerMessage, except?: WebSocket): void {
    const s = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) if (ws !== except) ws.send(s);
  }

  private stateMessage(): ServerMessage {
    return {
      type: "state",
      playback: this.playback,
      controlMode: this.controlMode,
      hostId: this.hostId ?? "",
    };
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    const att = ws.deserializeAttachment() as Attachment;

    switch (msg.type) {
      case "hello": {
        att.name = msg.name;
        if (this.hostId === null) {
          this.hostId = att.id;
          att.role = "host";
          await this.persist();
        }
        ws.serializeAttachment(att);
        ws.send(JSON.stringify({ type: "welcome", youId: att.id, snapshot: this.snapshot() } satisfies ServerMessage));
        this.broadcast({ type: "presence", participants: this.participants() });
        break;
      }
      case "ping": {
        ws.send(JSON.stringify({ type: "pong", t0: msg.t0, t1: Date.now() } satisfies ServerMessage));
        break;
      }
      case "control": {
        if (this.controlMode === "host" && att.id !== this.hostId) {
          ws.send(JSON.stringify({ type: "error", reason: "not authorized to control" } satisfies ServerMessage));
          return;
        }
        const now = Date.now();
        if (msg.action === "pause") {
          this.playback = { ...this.playback, paused: true, anchorMediaTime: msg.mediaTime, anchorServerTime: now };
        } else if (msg.action === "play") {
          this.playback = { ...this.playback, paused: false, anchorMediaTime: msg.mediaTime, anchorServerTime: now };
        } else {
          this.playback = { ...this.playback, anchorMediaTime: msg.mediaTime, anchorServerTime: now };
        }
        await this.persist();
        this.broadcast(this.stateMessage());
        break;
      }
      case "setMode": {
        if (att.id !== this.hostId) {
          ws.send(JSON.stringify({ type: "error", reason: "only the host can change mode" } satisfies ServerMessage));
          return;
        }
        this.controlMode = msg.mode;
        await this.persist();
        this.broadcast(this.stateMessage());
        break;
      }
      case "bye": {
        ws.close(1000, "bye");
        break;
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment;

    if (att.id === this.hostId) {
      const others = this.ctx.getWebSockets().filter((s) => s !== ws);
      if (others.length > 0) {
        const next = others[0]!;
        const na = next.deserializeAttachment() as Attachment;
        na.role = "host";
        next.serializeAttachment(na);
        this.hostId = na.id;
      } else {
        this.hostId = null;
      }
      await this.persist();
      this.broadcast(this.stateMessage(), ws);
    }

    this.broadcast({ type: "presence", participants: this.participants(ws) }, ws);
  }
}
