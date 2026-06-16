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
  /** Plaintext display name (plaintext sessions). */
  name?: string;
  /** Encrypted display name — seals `{ name }` (encrypted sessions). */
  nameBlob?: Envelope;
}

/** Who performed a playback action — attached to `state` for the activity feed. */
export interface Actor {
  id: string;
  /** Omitted in encrypted sessions; clients resolve the name from the roster by id. */
  name?: string;
}

// ---- Encryption ----
// An encrypted envelope: base64url(iv ‖ ciphertext+tag) produced by e2ee.ts. In an
// "encrypted session" the relay only ever sees these blobs for content-bearing
// fields, never plaintext. A room is all-or-nothing: every socket is encrypted or
// none is (the relay enforces this via the first `hello`'s `enc` flag).
export type Envelope = string;

/**
 * Playback timeline for an encrypted session. The relay can't read the action or
 * position, so it stores the opaque `blob` (seals `{ action, mediaTime }`) and
 * stamps `anchorServerTime` with its own clock on receipt — preserving the shared
 * time reference without learning what happened. `blob` is null until the host
 * issues the first control.
 */
export interface EncryptedPlayback {
  blob: Envelope | null;
  anchorServerTime: number;
}

/** Plaintext-session snapshot for a late joiner. */
export interface RoomSnapshot {
  controlMode: ControlMode;
  hostId: string;
  playback: Playback;
  participants: Participant[];
  content: string; // current media URL the room is watching ("" if unset)
}

/** Encrypted-session snapshot: the relay holds only opaque blobs + the shared clock. */
export interface EncryptedRoomSnapshot {
  controlMode: ControlMode;
  hostId: string;
  participants: Participant[];
  encPlayback: EncryptedPlayback;
  contentBlob: Envelope | null; // seals `{ url }`; null if unset
}

// ---- Wire protocol ----
export type ControlAction = "play" | "pause" | "seek";

// Content-bearing client messages carry EITHER the plaintext field(s) OR an
// encrypted envelope `c`. Which one is used is fixed per room: the first `hello`'s
// `enc` flag decides, and the relay refuses any later socket that disagrees.
export type ClientMessage =
  | { type: "hello"; name?: string; mediaTime?: number; enc?: boolean; c?: Envelope }
  | { type: "ping"; t0: number }
  | { type: "control"; action?: ControlAction; mediaTime?: number; c?: Envelope }
  | { type: "setMode"; mode: ControlMode }
  | { type: "setContent"; url?: string; c?: Envelope }
  | { type: "chat"; text?: string; c?: Envelope }
  | { type: "reaction"; emoji?: string; c?: Envelope }
  | { type: "bye" };

// Plaintext and encrypted server messages are distinct `type`s so each stays a
// precise, non-optional shape (`enc*` variants carry blobs; `from`/`actor` omit the
// name, which clients resolve from the roster by id).
export type ServerMessage =
  | { type: "welcome"; youId: string; snapshot: RoomSnapshot }
  | { type: "welcomeEnc"; youId: string; snapshot: EncryptedRoomSnapshot }
  | { type: "pong"; t0: number; t1: number }
  | { type: "state"; playback: Playback; controlMode: ControlMode; hostId: string; actor?: Actor }
  | { type: "encState"; encPlayback: EncryptedPlayback; controlMode: ControlMode; hostId: string; actor?: Actor }
  | { type: "presence"; participants: Participant[] }
  | { type: "content"; url: string; from: Actor }
  | { type: "encContent"; blob: Envelope; from: Actor }
  | { type: "chat"; from: Actor; text: string }
  | { type: "encChat"; from: Actor; c: Envelope }
  | { type: "reaction"; from: Actor; emoji: string }
  | { type: "encReaction"; from: Actor; c: Envelope }
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
