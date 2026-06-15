import { SyncClient, SyncSession, Html5VideoAdapter } from "@fossync/sync-core";
import type { Participant } from "@fossync/sync-core";
import { roomSocketUrl } from "./urls";
import { parseRoomCode, removeInvite } from "./invite";
import { randomName } from "./name-gen";
import { getOrCreateName } from "./name-store";
import { localNameStorage } from "./storage";
import { createSidebar } from "./sidebar";
import { derivePresenceEvents, deriveStateEvents, type StateSnap } from "./activity";

export interface SiteModule {
  /** Resolve the page's main media element (site-specific selection + waiting). */
  findVideo(): Promise<HTMLVideoElement | null>;
  /** Optional ad detection: call onAd(true/false); return a cleanup fn. */
  watchAds?(video: HTMLVideoElement, onAd: (adPlaying: boolean) => void): () => void;
}

export function startPageSync(site: SiteModule): void {
  let client: SyncClient | null = null;
  let session: SyncSession | null = null;
  let tickTimer: number | null = null;
  let stopAds: (() => void) | null = null;
  let currentCode: string | null = null;
  let adPlaying = false;
  let generation = 0;
  // Feed-diff baselines; null until the room is joined (post-welcome) so we don't
  // announce people/state that were already there when you connected.
  let prevParticipants: Participant[] | null = null;
  let prevState: StateSnap | null = null;

  const sidebar = createSidebar();
  sidebar.onLeave(() => leaveRoom());
  sidebar.onChatSend((text) => client?.sendChat(text));
  sidebar.onReactionSend((emoji) => client?.sendReaction(emoji));

  function teardown(): void {
    generation++; // invalidate any in-flight connectTo
    if (tickTimer !== null) {
      window.clearInterval(tickTimer);
      tickTimer = null;
    }
    if (stopAds) {
      stopAds();
      stopAds = null;
    }
    adPlaying = false;
    prevParticipants = null;
    prevState = null;
    session?.stop();
    session = null;
    client?.close();
    client = null;
  }

  // Leaving = drop the room code from the URL; the page goes back to plain content.
  function leaveRoom(): void {
    currentCode = null;
    teardown();
    history.replaceState(null, "", removeInvite(window.location.href));
    sidebar.hide();
  }

  async function connectTo(code: string): Promise<void> {
    console.log("[fossync] connecting to room", code, "via", roomSocketUrl(code));
    teardown();
    const gen = generation;
    currentCode = code;
    sidebar.setRoom(code);
    sidebar.setInvite(window.location.href);
    sidebar.setStatus("● looking for video…");
    sidebar.show();
    const video = await site.findVideo();
    if (gen !== generation) return; // superseded
    if (!video) {
      currentCode = null; // allow a later hashchange to retry once a video mounts
      sidebar.setStatus("● no video found on this page");
      return;
    }
    sidebar.setVideo(video);
    const name = await getOrCreateName(localNameStorage, () => randomName());
    if (gen !== generation) return; // superseded
    client = new SyncClient({
      url: roomSocketUrl(code),
      name,
      pingCount: 5,
      createSocket: (url) => new WebSocket(url),
      now: () => Date.now(),
      schedule: (fn, ms) => window.setTimeout(fn, ms),
      getMediaTime: () => video.currentTime,
    });
    client.onError((reason) => console.warn("[fossync] server error:", reason));
    client.onChat((m) => sidebar.addChat(m));
    client.onReaction((m) => sidebar.showReaction(m.emoji));
    client.connect();
    session = new SyncSession({
      client,
      adapter: new Html5VideoAdapter(video),
      now: () => Date.now(),
      setInterval: (fn, ms) => window.setInterval(fn, ms),
      clearInterval: (h) => window.clearInterval(h as number),
    });
    session.start();
    if (site.watchAds) {
      stopAds = site.watchAds(video, (playing) => {
        adPlaying = playing;
        session?.setPaused(playing);
      });
    }
    tickTimer = window.setInterval(tick, 250);
    tick();
  }

  function tick(): void {
    if (!client) return;
    const youId = client.getYouId();
    const hostId = client.getHostId();
    const participants = client.getParticipants();
    const pb = client.getPlayback();

    if (adPlaying) sidebar.setStatus("● ad — sync paused");
    else if (youId === null || pb === null) sidebar.setStatus("● connecting…");
    else sidebar.setStatus(`● synced · ${participants.length} watching`);

    sidebar.setParticipants(participants, youId, hostId);

    if (youId === null) return; // not in the room yet — no feed baseline / events
    const nameOf = (id: string) => participants.find((p) => p.id === id)?.name ?? null;
    const events = derivePresenceEvents(prevParticipants, participants);
    prevParticipants = participants;
    if (pb) {
      const snap: StateSnap = { playback: pb, hostId: hostId ?? "" };
      events.push(...deriveStateEvents(prevState, snap, client.getActor(), youId, nameOf));
      prevState = snap;
    }
    if (events.length) sidebar.addEvents(events);
  }

  function handleHash(): void {
    const code = parseRoomCode(window.location.hash);
    if (code) {
      if (code !== currentCode) void connectTo(code);
    } else {
      currentCode = null;
      teardown();
      sidebar.hide();
    }
  }

  window.addEventListener("hashchange", handleHash);
  window.addEventListener("pagehide", teardown);
  handleHash();
}
