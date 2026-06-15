import type { Actor, Participant } from "@fossync/sync-core";
import type { ActivityEvent } from "./activity";

const FONT = "13px/1.45 system-ui,-apple-system,sans-serif";
const MONO = "12px ui-monospace,monospace";
const REACTIONS = ["😂", "❤️", "😮", "👏", "🔥"];
const PANEL_W = 320;

function el(tag: string, css: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.style.cssText = css;
  if (text !== undefined) node.textContent = text;
  return node;
}

function sectionHead(text: string): HTMLElement {
  return el("div", `padding:9px 12px 2px;font:${MONO};letter-spacing:.09em;color:#6b6b73;`, text);
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
  onLeave(cb: () => void): void;
  onChatSend(cb: (text: string) => void): void;
  onReactionSend(cb: (emoji: string) => void): void;
}

// A full-height panel docked to the right edge, drawn over the page, collapsible to
// a thin tab. The whole thing is reparented into the fullscreen element when the
// player goes fullscreen, so it (and the re-open tab) stay visible over the video.
export function createSidebar(): Sidebar {
  let leaveCb: (() => void) | null = null;
  let chatSendCb: ((text: string) => void) | null = null;
  let reactionSendCb: ((emoji: string) => void) | null = null;
  let inviteUrl = "";
  let collapsed = false;
  let youId: string | null = null;
  let video: HTMLVideoElement | null = null;
  let pillRoom = "";
  let pillCount = 0;

  // Full-viewport, click-through (children opt back in); reparented on fullscreen.
  const root = el("div", `position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:none;font:${FONT};color:#e8e8ea;`);

  const reactionLayer = el("div", "position:absolute;inset:0;overflow:hidden;pointer-events:none;");

  const tab = el("div",
    "position:absolute;top:50%;right:0;transform:translateY(-50%);background:#16161a;color:#3ddc84;" +
    "border:1px solid #2a2a30;border-right:none;border-radius:8px 0 0 8px;padding:12px 6px;cursor:pointer;" +
    `pointer-events:auto;display:none;box-shadow:-2px 0 12px rgba(0,0,0,.45);writing-mode:vertical-rl;font:${MONO};letter-spacing:.12em;`,
    "◀ fossync");
  tab.addEventListener("click", () => setCollapsed(false));

  const panel = el("div",
    `position:absolute;top:0;right:0;height:100%;width:${PANEL_W}px;box-sizing:border-box;display:flex;` +
    "flex-direction:column;background:#16161a;border-left:1px solid #2a2a30;box-shadow:-8px 0 30px rgba(0,0,0,.45);pointer-events:auto;");

  const header = el("div", "display:flex;align-items:center;gap:8px;padding:11px 12px;border-bottom:1px solid #2a2a30;");
  const roomLabel = el("div", `flex:1;font:${MONO};color:#9a9aa2;`, "");
  const collapseBtn = el("button", btnCss("transparent", "#9a9aa2") + ";padding:2px 8px;font-size:16px;", "→");
  collapseBtn.title = "Collapse";
  collapseBtn.addEventListener("click", () => setCollapsed(true));
  header.append(el("div", "font-weight:700;color:#fff;", "◆ fossync"), roomLabel, collapseBtn);

  const status = el("div", `padding:7px 12px;font:${MONO};color:#3ddc84;border-bottom:1px solid #2a2a30;`, "connecting…");

  const watching = el("div", "padding:3px 12px 8px;display:flex;flex-direction:column;gap:4px;max-height:22%;overflow-y:auto;");
  const feed = el("div", "flex:1;min-height:96px;overflow-y:auto;padding:3px 12px 8px;display:flex;flex-direction:column;gap:4px;");

  const reactionsBar = el("div", "display:flex;gap:6px;padding:8px 12px;border-top:1px solid #2a2a30;font-size:18px;");
  for (const emoji of REACTIONS) {
    const b = el("button", "background:none;border:none;cursor:pointer;padding:2px;font-size:18px;line-height:1;", emoji);
    b.addEventListener("click", () => reactionSendCb?.(emoji));
    reactionsBar.append(b);
  }

  const chatRow = el("div", "display:flex;gap:6px;padding:8px 12px;border-top:1px solid #2a2a30;");
  const chatInput = el("input",
    "flex:1;min-width:0;box-sizing:border-box;background:#0f0f12;border:1px solid #2a2a30;border-radius:8px;" +
    `padding:8px 9px;color:#e8e8ea;font:${FONT};`) as HTMLInputElement;
  chatInput.placeholder = "Type a message…";
  chatInput.maxLength = 500;
  const sendBtn = el("button", btnCss("#23232a", "#e8e8ea"), "➤");
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

  const footer = el("div", "display:flex;gap:8px;padding:10px 12px;border-top:1px solid #2a2a30;");
  const copyBtn = el("button", btnCss("#23232a", "#e8e8ea") + ";flex:1;", "🔗 Copy invite");
  const leaveBtn = el("button", btnCss("#2a1416", "#ff6b6b"), "⎋ Leave");
  copyBtn.addEventListener("click", async () => {
    if (!inviteUrl) return;
    try { await navigator.clipboard.writeText(inviteUrl); flash(copyBtn, "✓ Copied"); }
    catch { flash(copyBtn, "Press Ctrl+C"); }
  });
  leaveBtn.addEventListener("click", () => leaveCb?.());
  footer.append(copyBtn, leaveBtn);

  panel.append(header, status, sectionHead("WATCHING"), watching, sectionHead("FEED"), feed, reactionsBar, chatRow, footer);
  root.append(reactionLayer, tab, panel);
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
    tab.style.display = c ? "block" : "none";
  }

  function updatePill(): void {
    tab.textContent = `◀ ${pillRoom || "fossync"} · ${pillCount}`;
  }

  function pushFeed(node: HTMLElement): void {
    feed.append(node);
    while (feed.childElementCount > 200) feed.firstElementChild?.remove();
    feed.scrollTop = feed.scrollHeight;
  }

  return {
    show: () => { root.style.display = "block"; setCollapsed(collapsed); },
    hide: () => { root.style.display = "none"; },
    setRoom: (code) => { pillRoom = code; roomLabel.textContent = "room " + code; updatePill(); },
    setStatus: (text) => { status.textContent = text; },
    setVideo: (v) => { video = v; },
    setParticipants: (list, you, hostId) => {
      youId = you;
      pillCount = list.length;
      updatePill();
      watching.replaceChildren();
      for (const p of list) {
        const row = el("div", "display:flex;align-items:center;gap:6px;");
        row.append(el("span", "color:#3ddc84;font-size:10px;", "●"));
        row.append(el("span", "color:#e8e8ea;", p.name));
        if (p.id === hostId) row.append(el("span", `font:${MONO};color:#ffd479;`, "host"));
        if (p.id === you) row.append(el("span", `font:${MONO};color:#9a9aa2;`, "· you"));
        watching.append(row);
      }
    },
    addEvents: (events) => {
      for (const e of events) pushFeed(el("div", "color:#8d8d96;", "— " + e.text));
    },
    addChat: ({ from, text }) => {
      const row = el("div", "color:#e8e8ea;word-break:break-word;");
      row.append(el("span", "color:#7ab8ff;font-weight:600;", (from.id === youId ? "You" : from.name) + ": "));
      row.append(el("span", "", text)); // textContent — never interpret message HTML
      pushFeed(row);
    },
    showReaction: (emoji) => {
      const rect = video?.getBoundingClientRect();
      const x = rect && rect.width ? rect.left + rect.width / 2 : window.innerWidth / 2;
      const y = rect && rect.height ? rect.top + rect.height - 48 : window.innerHeight - 96;
      const node = el("div", `position:absolute;left:${x}px;top:${y}px;font-size:30px;will-change:transform,opacity;`, emoji);
      reactionLayer.append(node);
      const dx = (Math.random() - 0.5) * 90;
      const anim = node.animate(
        [
          { transform: "translate(-50%,0) scale(.5)", opacity: 0 },
          { transform: "translate(-50%,-14px) scale(1)", opacity: 1, offset: 0.18 },
          { transform: `translate(calc(-50% + ${dx}px),-150px) scale(1)`, opacity: 0 },
        ],
        { duration: 1900, easing: "ease-out" },
      );
      anim.onfinish = () => node.remove();
    },
    setInvite: (url) => { inviteUrl = url; },
    onLeave: (cb) => { leaveCb = cb; },
    onChatSend: (cb) => { chatSendCb = cb; },
    onReactionSend: (cb) => { reactionSendCb = cb; },
  };
}
