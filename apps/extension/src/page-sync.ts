import { SyncClient, SyncSession, Html5VideoAdapter } from "@fossync/sync-core";
import type { Participant } from "@fossync/sync-core";
import { roomSocketUrl } from "./urls";
import { getRelay } from "./relay";
import { parseRoomCode, removeInvite, buildInviteUrl } from "./invite";
import { buildShareUrl } from "./branded";
import { getBrandedUrls } from "./branded-store";
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
  /** Optional: detect in-page navigation to a different media URL (SPA episode changes). */
  watchNavigation?(onNavigate: (url: string) => void): () => void;
}

const cleanUrl = (u: string): string => u.split("#")[0]!;

export function startPageSync(site: SiteModule): void {
  let client: SyncClient | null = null;
  let session: SyncSession | null = null;
  let adapter: Html5VideoAdapter | null = null;
  let currentVideo: HTMLVideoElement | null = null;
  let tickTimer: number | null = null;
  let stopAds: (() => void) | null = null;
  let stopNav: (() => void) | null = null;
  let currentCode: string | null = null;
  // Relay origin + branded preference, captured on connect so the invite link
  // (which may be rebuilt on episode change) doesn't need to re-read them.
  let relayHttpOrigin = "";
  let brandedOn = false;
  let adPlaying = false;
  let generation = 0;
  // Feed-diff baselines; null until the room is joined (post-welcome).
  let prevParticipants: Participant[] | null = null;
  let prevState: StateSnap | null = null;

  const sidebar = createSidebar();
  sidebar.onLeave(() => leaveRoom());
  sidebar.onChatSend((text) => client?.sendChat(text));
  sidebar.onReactionSend((emoji) => client?.sendReaction(emoji));

  // Build the per-video sync session. The room connection (client) outlives this,
  // so an episode change just swaps the session/adapter onto the new <video>.
  function attachVideo(video: HTMLVideoElement): void {
    currentVideo = video;
    sidebar.setVideo(video);
    adapter = new Html5VideoAdapter(video);
    // Browsers block our programmatic play() until the joiner makes a gesture.
    adapter.onPlayBlocked(() => sidebar.showPlayGate(() => adapter?.play()));
    session = new SyncSession({
      client: client!,
      adapter,
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
  }

  function detachVideo(): void {
    if (stopAds) {
      stopAds();
      stopAds = null;
    }
    adPlaying = false;
    session?.stop();
    session = null;
    adapter = null;
    currentVideo = null;
  }

  function teardown(): void {
    generation++; // invalidate any in-flight connectTo / reattach
    if (tickTimer !== null) {
      window.clearInterval(tickTimer);
      tickTimer = null;
    }
    if (stopNav) {
      stopNav();
      stopNav = null;
    }
    prevParticipants = null;
    prevState = null;
    detachVideo();
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
    teardown();
    const gen = generation;
    currentCode = code;
    const relay = await getRelay();
    if (gen !== generation) return; // superseded
    relayHttpOrigin = relay.httpOrigin;
    brandedOn = __BRANDED__ && (await getBrandedUrls());
    if (gen !== generation) return; // superseded
    console.log("[fossync] connecting to room", code, "via", roomSocketUrl(relay.wsOrigin, code));
    if (!relay.isOfficial) sidebar.showRelayWarning(relay.wsOrigin);
    sidebar.setRoom(code);
    sidebar.setInvite(buildShareUrl(cleanUrl(window.location.href), code, relayHttpOrigin, brandedOn));
    sidebar.setStatus("● looking for video…");
    sidebar.show();
    const video = await site.findVideo();
    if (gen !== generation) return; // superseded
    if (!video) {
      currentCode = null; // allow a later hashchange to retry once a video mounts
      sidebar.setStatus("● no video found on this page");
      return;
    }
    const name = await getOrCreateName(localNameStorage, () => randomName());
    if (gen !== generation) return; // superseded
    client = new SyncClient({
      url: roomSocketUrl(relay.wsOrigin, code),
      name,
      pingCount: 5,
      createSocket: (url) => new WebSocket(url),
      now: () => Date.now(),
      schedule: (fn, ms) => window.setTimeout(fn, ms),
      getMediaTime: () => currentVideo?.currentTime ?? 0,
    });
    client.onError((reason) => console.warn("[fossync] server error:", reason));
    client.onChat((m) => sidebar.addChat(m));
    client.onReaction((m) => sidebar.showReaction(m.emoji));
    client.onContent((url) => followContent(url));
    client.connect();
    attachVideo(video);
    if (site.watchNavigation) stopNav = site.watchNavigation((url) => onLocalNav(url));
    tickTimer = window.setInterval(tick, 250);
    tick();
  }

  // We navigated to a different media URL inside the SPA (e.g. Crunchyroll next episode).
  function onLocalNav(url: string): void {
    if (!currentCode || !client) return;
    const clean = cleanUrl(url);
    const withCode = buildInviteUrl(clean, currentCode);
    if (window.location.href !== withCode) history.replaceState(null, "", withCode); // re-add the room code Crunchyroll dropped
    sidebar.setInvite(buildShareUrl(clean, currentCode, relayHttpOrigin, brandedOn));
    client.setContent(clean); // server gates by control mode + resets the timeline
    detachVideo();
    void reattach(generation);
  }

  async function reattach(gen: number): Promise<void> {
    sidebar.setStatus("● switching episode…");
    const video = await site.findVideo();
    if (gen !== generation || !currentCode) return; // superseded / left
    if (video) attachVideo(video);
    else sidebar.setStatus("● no video found on this page");
  }

  // Someone else moved the room to different content — follow them via a full reload.
  function followContent(url: string): void {
    if (!currentCode || !url) return;
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return;
    }
    if (target.origin !== window.location.origin) return; // never navigate off-site
    if (target.pathname === window.location.pathname) return; // already on this content
    window.location.assign(buildInviteUrl(cleanUrl(url), currentCode));
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
    if (adapter && !adapter.isPaused()) sidebar.hidePlayGate(); // playing now — gate not needed

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
