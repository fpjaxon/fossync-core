// ---- Playback timeline ----
export type ControlMode = "host" | "everyone";

export interface Playback {
  paused: boolean;
  anchorMediaTime: number; // seconds into the video at the anchor
  anchorServerTime: number; // DO clock (ms) at the anchor
  rate: number; // normally 1.0
}

export interface Participant {
  id: string;
  role: "host" | "guest";
  name: string;
}

/** Who performed a playback action — attached to `state` for the activity feed. */
export interface Actor {
  id: string;
  name: string;
}

export interface RoomSnapshot {
  controlMode: ControlMode;
  hostId: string;
  playback: Playback;
  participants: Participant[];
}

// ---- Wire protocol ----
export type ControlAction = "play" | "pause" | "seek";

export type ClientMessage =
  | { type: "hello"; name: string; mediaTime?: number }
  | { type: "ping"; t0: number }
  | { type: "control"; action: ControlAction; mediaTime: number }
  | { type: "setMode"; mode: ControlMode }
  | { type: "chat"; text: string }
  | { type: "reaction"; emoji: string }
  | { type: "bye" };

export type ServerMessage =
  | { type: "welcome"; youId: string; snapshot: RoomSnapshot }
  | { type: "pong"; t0: number; t1: number }
  | { type: "state"; playback: Playback; controlMode: ControlMode; hostId: string; actor?: Actor }
  | { type: "presence"; participants: Participant[] }
  | { type: "chat"; from: Actor; text: string }
  | { type: "reaction"; from: Actor; emoji: string }
  | { type: "error"; reason: string };

// ---- Player adapter (the service-agnostic seam) ----
export type UserIntent =
  | { kind: "play"; mediaTime: number }
  | { kind: "pause"; mediaTime: number }
  | { kind: "seek"; mediaTime: number };

export interface PlayerAdapter {
  getCurrentTime(): number;
  getDuration(): number;
  isPaused(): boolean;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setPlaybackRate(rate: number): void;
  /** Fires only on genuine HUMAN intent — never on our own programmatic calls. */
  onUserIntent(cb: (intent: UserIntent) => void): void;
}
