import type { Actor, Participant } from "@fossync/sync-core";
import type { ActivityEvent } from "./activity";
import { C, FONT, MONO } from "./theme";
import { REACTIONS } from "./emoji-assets";
import { createReactionLayer } from "./reaction-layer";
import { createChatToasts } from "./chat-toasts";

function el(tag: string, css: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.style.cssText = css;
  if (text !== undefined) node.textContent = text;
  return node;
}

function sectionHead(text: string): HTMLElement {
  return el("div", `padding:9px 12px 2px;font:${MONO};letter-spacing:.09em;color:${C.faint};`, text);
}

function btnCss(bg: string, color: string): string {
  return `background:${bg};color:${color};border:none;border-radius:8px;padding:7px 10px;font:${FONT};cursor:pointer`;
}

function flash(btn: HTMLElement, text: string): void {
  const orig = btn.textContent;
  btn.textContent = text;
  window.setTimeout(() => { btn.textContent = orig; }, 1200);
}

export interface Sidebar {
  show(): void;
  hide(): void;
  setRoom(code: string): void;
  setStatus(text: string): void;
  setParticipants(list: Participant[], youId: string | null, hostId: string | null): void;
  addEvents(events: ActivityEvent[]): void;
  addChat(msg: { from: Actor; text: string }): void;
  showReaction(emoji: string): void;
  setInvite(url: string): void;
  setVideo(video: HTMLVideoElement | null): void;
  /** Show a persistent banner that the room is on a non-official (third-party) relay. */
  showRelayWarning(origin: string): void;
  /** Toggle the encrypted-session lock badge in the header. */
  setEncrypted(on: boolean): void;
  /** Show a persistent security banner (missing key / undecryptable / tampered messages). */
  showSecurityWarning(message: string): void;
  /** Prompt for the one user gesture browsers require before programmatic play. */
  showPlayGate(onPlay: () => void): void;
  hidePlayGate(): void;
  onLeave(cb: () => void): void;
  onChatSend(cb: (text: string) => void): void;
  onReactionSend(cb: (emoji: string) => void): void;
}

// A full-height panel docked to the right edge, drawn over the page. Collapses
// to a small translucent logo sphere (lower-right) that pulses on activity and
// surfaces chat as toasts beside it. The whole thing is reparented into the
// fullscreen element when the player goes fullscreen, so it stays visible.
export function createSidebar(): Sidebar {
  let leaveCb: (() => void) | null = null;
  let chatSendCb: ((text: string) => void) | null = null;
  let reactionSendCb: ((emoji: string) => void) | null = null;
  let gatePlayCb: (() => void) | null = null;
  let inviteUrl = "";
  let collapsed = false;
  let youId: string | null = null;
  let video: HTMLVideoElement | null = null;

  // Full-viewport, click-through (children opt back in); reparented on fullscreen.
  const root = el("div", `position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:none;font:${FONT};color:${C.text};`);

  const reactionLayer = createReactionLayer();
  const chatToasts = createChatToasts();
  chatToasts.onOpen(() => setCollapsed(false));

  // Collapsed affordance: a frosted logo sphere with a pulse ring + unread dot.
  const sphere = el("button",
    "position:absolute;right:16px;bottom:15%;width:32px;height:32px;border-radius:50%;" +
    `background:rgba(22,22,26,.55);border:1px solid rgba(61,220,132,.35);color:${C.green};` +
    "cursor:pointer;pointer-events:auto;display:none;align-items:center;justify-content:center;" +
    "font-size:15px;line-height:1;box-shadow:0 2px 10px rgba(0,0,0,.5);backdrop-filter:blur(8px);" +
    "-webkit-backdrop-filter:blur(8px);transition:transform .15s ease,border-color .15s ease;");
  sphere.textContent = "◆";
  sphere.title = "Open fossync";
  sphere.setAttribute("aria-label", "Open fossync panel");
  const ring = el("span", "position:absolute;inset:-1px;border-radius:50%;border:2px solid transparent;pointer-events:none;opacity:0;");
  const unreadDot = el("span",
    `position:absolute;top:-1px;right:-1px;width:7px;height:7px;border-radius:50%;background:${C.blue};` +
    "border:1.5px solid #0c0c0f;display:none;");
  sphere.append(ring, unreadDot);
  sphere.addEventListener("mouseenter", () => { sphere.style.transform = "scale(1.08)"; sphere.style.borderColor = C.green; });
  sphere.addEventListener("mouseleave", () => { sphere.style.transform = "scale(1)"; sphere.style.borderColor = "rgba(61,220,132,.35)"; });
  sphere.addEventListener("click", () => setCollapsed(false));

  function pulse(kind: "chat" | "reaction"): void {
    ring.style.borderColor = kind === "chat" ? C.blue : C.green;
    ring.animate(
      [{ transform: "scale(1)", opacity: 0.6 }, { transform: "scale(2.3)", opacity: 0 }],
      { duration: 900, easing: "ease-out" },
    );
  }

  const panel = el("div",
    `position:absolute;top:0;right:0;height:100%;width:320px;box-sizing:border-box;display:flex;` +
    `flex-direction:column;background:${C.bg};border-left:1px solid ${C.border};box-shadow:-8px 0 30px rgba(0,0,0,.45);pointer-events:auto;`);

  const header = el("div", `display:flex;align-items:center;gap:8px;padding:11px 12px;border-bottom:1px solid ${C.border};`);
  const roomLabel = el("div", `flex:1;font:${MONO};color:${C.muted};`, "");
  // Lock badge shown only in an encrypted session (set via setEncrypted).
  const lock = el("span", `display:none;font:${MONO};color:${C.green};`, "🔒 e2ee");
  lock.title = "Encrypted session — the relay can't read chat, names, what you're watching, or playback.";
  const collapseBtn = el("button", btnCss("transparent", C.muted) + ";padding:2px 8px;font-size:16px;", "→");
  collapseBtn.title = "Collapse";
  collapseBtn.addEventListener("click", () => setCollapsed(true));
  header.append(el("div", "font-weight:700;color:#fff;", "◆ fossync"), roomLabel, lock, collapseBtn);

  const status = el("div", `padding:7px 12px;font:${MONO};color:${C.green};border-bottom:1px solid ${C.border};`, "connecting…");

  const relayWarning = el("div",
    "display:none;margin:8px 12px 0;padding:8px 10px;border-radius:8px;background:#3a2c00;" +
    `color:${C.warn};border:1px solid #6b5300;font:${MONO};line-height:1.45;`, "");

  // Security banner for encryption problems (missing key, undecryptable / tampered messages).
  const securityWarning = el("div",
    "display:none;margin:8px 12px 0;padding:8px 10px;border-radius:8px;background:#2a1416;" +
    `color:${C.danger};border:1px solid #5b2327;font:${MONO};line-height:1.45;`, "");

  const watching = el("div", "padding:3px 12px 8px;display:flex;flex-direction:column;gap:4px;max-height:22%;overflow-y:auto;");
  const feed = el("div", "flex:1;min-height:96px;overflow-y:auto;padding:3px 12px 8px;display:flex;flex-direction:column;gap:4px;");

  const reactionsBar = el("div", `display:flex;gap:6px;padding:8px 12px;border-top:1px solid ${C.border};font-size:18px;`);
  for (const emoji of REACTIONS) {
    const b = el("button", "background:none;border:none;cursor:pointer;padding:2px;font-size:18px;line-height:1;", emoji);
    b.addEventListener("click", () => reactionSendCb?.(emoji));
    reactionsBar.append(b);
  }

  const chatRow = el("div", `display:flex;gap:6px;padding:8px 12px;border-top:1px solid ${C.border};`);
  const chatInput = el("input",
    `flex:1;min-width:0;box-sizing:border-box;background:${C.bgInput};border:1px solid ${C.border};border-radius:8px;` +
    `padding:8px 9px;color:${C.text};font:${FONT};`) as HTMLInputElement;
  chatInput.placeholder = "Type a message…";
  chatInput.maxLength = 500;
  const sendBtn = el("button", btnCss("#23232a", C.text), "➤");
  const sendChat = () => {
    const t = chatInput.value.trim();
    if (!t) return;
    chatSendCb?.(t);
    chatInput.value = "";
  };
  // Keep keystrokes out of the page (so typing doesn't trigger the player's k/space/f shortcuts).
  chatInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); sendChat(); }
  });
  chatInput.addEventListener("keyup", (e) => e.stopPropagation());
  chatInput.addEventListener("keypress", (e) => e.stopPropagation());
  sendBtn.addEventListener("click", sendChat);
  chatRow.append(chatInput, sendBtn);

  const footer = el("div", `display:flex;gap:8px;padding:10px 12px;border-top:1px solid ${C.border};`);
  const copyBtn = el("button", btnCss("#23232a", C.text) + ";flex:1;", "🔗 Copy invite");
  const leaveBtn = el("button", btnCss("#2a1416", C.danger), "⎋ Leave");
  copyBtn.addEventListener("click", async () => {
    if (!inviteUrl) return;
    try { await navigator.clipboard.writeText(inviteUrl); flash(copyBtn, "✓ Copied"); }
    catch { flash(copyBtn, "Press Ctrl+C"); }
  });
  leaveBtn.addEventListener("click", () => leaveCb?.());
  footer.append(copyBtn, leaveBtn);

  // One-click gate over the video — the gesture browsers require before we can
  // programmatically play a joiner whose room is already playing.
  const playGate = el("button",
    "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:auto;display:none;" +
    `background:rgba(18,18,22,.93);color:#fff;border:1px solid ${C.green};border-radius:12px;padding:14px 22px;` +
    `cursor:pointer;font:${FONT};font-size:15px;box-shadow:0 8px 28px rgba(0,0,0,.55);`,
    "▶  Click to watch in sync");
  playGate.addEventListener("click", () => { const cb = gatePlayCb; hidePlayGate(); cb?.(); });

  panel.append(header, status, relayWarning, securityWarning, sectionHead("WATCHING"), watching, sectionHead("FEED"), feed, reactionsBar, chatRow, footer);
  root.append(reactionLayer.element, chatToasts.element, sphere, panel, playGate);
  document.documentElement.appendChild(root);

  // Fullscreen: move the whole sidebar into the fullscreened element (unless it's a
  // bare <video>, which can't hold children) so it keeps rendering over the video.
  function onFsChange(): void {
    const fsEl = document.fullscreenElement;
    const target = fsEl && !(fsEl instanceof HTMLMediaElement) ? fsEl : document.documentElement;
    if (root.parentElement !== target) target.appendChild(root);
  }
  document.addEventListener("fullscreenchange", onFsChange);

  function setCollapsed(c: boolean): void {
    collapsed = c;
    panel.style.display = c ? "none" : "flex";
    sphere.style.display = c ? "flex" : "none";
    if (!c) { chatToasts.clear(); unreadDot.style.display = "none"; }
  }

  function pushFeed(node: HTMLElement): void {
    feed.append(node);
    while (feed.childElementCount > 200) feed.firstElementChild?.remove();
    feed.scrollTop = feed.scrollHeight;
  }

  function showPlayGate(onPlay: () => void): void {
    if (playGate.style.display === "block") return; // already prompting
    const rect = video?.getBoundingClientRect();
    playGate.style.left = rect && rect.width ? `${rect.left + rect.width / 2}px` : "50%";
    playGate.style.top = rect && rect.height ? `${rect.top + rect.height / 2}px` : "50%";
    gatePlayCb = onPlay;
    playGate.style.display = "block";
  }

  function hidePlayGate(): void {
    gatePlayCb = null;
    playGate.style.display = "none";
  }

  return {
    show: () => { root.style.display = "block"; setCollapsed(collapsed); },
    hide: () => { root.style.display = "none"; },
    setRoom: (code) => { roomLabel.textContent = "room " + code; },
    setStatus: (text) => { status.textContent = text; },
    setVideo: (v) => { video = v; },
    showRelayWarning: (origin) => {
      relayWarning.textContent =
        `⚠ Third-party relay (${origin}). It can see this room (who's watching, what, chat) ` +
        "and your IP, and can control playback. Only connect to relays you trust.";
      relayWarning.style.display = "block";
    },
    setEncrypted: (on) => { lock.style.display = on ? "inline" : "none"; },
    showSecurityWarning: (message) => {
      securityWarning.textContent = "🔒 " + message;
      securityWarning.style.display = "block";
    },
    setParticipants: (list, you, hostId) => {
      youId = you;
      watching.replaceChildren();
      for (const p of list) {
        const row = el("div", "display:flex;align-items:center;gap:6px;");
        row.append(el("span", `color:${C.green};font-size:10px;`, "●"));
        row.append(el("span", `color:${C.text};`, p.name ?? "…"));
        if (p.id === hostId) row.append(el("span", `font:${MONO};color:${C.warn};`, "host"));
        if (p.id === you) row.append(el("span", `font:${MONO};color:${C.muted};`, "· you"));
        watching.append(row);
      }
    },
    addEvents: (events) => {
      for (const e of events) pushFeed(el("div", "color:#8d8d96;", "— " + e.text));
    },
    addChat: ({ from, text }) => {
      const row = el("div", `color:${C.text};word-break:break-word;`);
      row.append(el("span", `color:${C.blue};font-weight:600;`, (from.id === youId ? "You" : from.name ?? "Someone") + ": "));
      row.append(el("span", "", text)); // textContent — never interpret message HTML
      pushFeed(row);
      // When collapsed, someone else's message surfaces as a toast + sphere cue.
      if (collapsed && from.id !== youId) {
        chatToasts.push(from.name ?? "Someone", text);
        pulse("chat");
        unreadDot.style.display = "block";
      }
    },
    showReaction: (emoji) => {
      reactionLayer.spawn(emoji);
      if (collapsed) pulse("reaction");
    },
    setInvite: (url) => { inviteUrl = url; },
    showPlayGate,
    hidePlayGate,
    onLeave: (cb) => { leaveCb = cb; },
    onChatSend: (cb) => { chatSendCb = cb; },
    onReactionSend: (cb) => { reactionSendCb = cb; },
  };
}
