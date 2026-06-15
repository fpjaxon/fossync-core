import type { Actor, Participant, Playback } from "@fossync/sync-core";

export type ActivityKind = "join" | "leave" | "play" | "pause" | "seek" | "host";

export interface ActivityEvent {
  kind: ActivityKind;
  text: string;
}

/** Seconds → "m:ss" (or "h:mm:ss" past an hour). */
export function formatTimecode(seconds: number): string {
  let t = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * Diff two participant lists into join/leave events. A null `prev` means this is
 * the first snapshot (baseline) — no events, so we don't announce people already
 * in the room when you connect.
 */
export function derivePresenceEvents(
  prev: Participant[] | null,
  curr: Participant[],
): ActivityEvent[] {
  if (prev === null) return [];
  const prevIds = new Set(prev.map((p) => p.id));
  const currIds = new Set(curr.map((p) => p.id));
  const events: ActivityEvent[] = [];
  for (const p of curr) if (!prevIds.has(p.id)) events.push({ kind: "join", text: `${p.name} joined` });
  for (const p of prev) if (!currIds.has(p.id)) events.push({ kind: "leave", text: `${p.name} left` });
  return events;
}

export interface StateSnap {
  playback: Playback;
  hostId: string;
}

/**
 * Diff two authoritative-state snapshots into playback/host events. The server
 * only emits `state` on an actual control, so any playback change here is a real
 * action by `actor` (null `prev` is the baseline — no events).
 */
export function deriveStateEvents(
  prev: StateSnap | null,
  curr: StateSnap,
  actor: Actor | null,
  youId: string | null,
  nameOf: (id: string) => string | null,
): ActivityEvent[] {
  if (prev === null) return [];
  const events: ActivityEvent[] = [];
  const who = actor ? (actor.id === youId ? "You" : actor.name) : "Someone";

  const pp = prev.playback;
  const cp = curr.playback;
  if (pp.paused !== cp.paused) {
    events.push(
      cp.paused ? { kind: "pause", text: `${who} paused` } : { kind: "play", text: `${who} resumed` },
    );
  } else if (pp.anchorMediaTime !== cp.anchorMediaTime) {
    events.push({ kind: "seek", text: `${who} skipped to ${formatTimecode(cp.anchorMediaTime)}` });
  }

  if (prev.hostId !== curr.hostId && curr.hostId) {
    const isYou = curr.hostId === youId;
    const hostName = isYou ? "You" : nameOf(curr.hostId) ?? "Someone";
    events.push({ kind: "host", text: `${hostName} ${isYou ? "are" : "is"} now host` });
  }

  return events;
}
