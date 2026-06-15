import type { Participant } from "@fossync/sync-core";
import type { ActivityEvent } from "./activity";

const FONT = "13px/1.45 system-ui,-apple-system,sans-serif";
const MONO = "12px ui-monospace,monospace";

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
  setInvite(url: string): void;
  onLeave(cb: () => void): void;
}

// A Teleparty-style in-page panel: collapsed it's a small pill (the old badge),
// expanded it shows participants, a live activity feed, and stubbed chat/reactions.
export function createSidebar(): Sidebar {
  let leaveCb: (() => void) | null = null;
  let inviteUrl = "";
  let collapsed = false;
  let pillRoom = "";
  let pillCount = 0;

  const root = el("div", "position:fixed;top:12px;right:12px;z-index:2147483647;display:none;" + `font:${FONT};color:#e8e8ea;`);

  const pill = el("div",
    `background:#16161a;color:#3ddc84;font:${MONO};padding:7px 11px;border-radius:18px;` +
    "box-shadow:0 2px 12px rgba(0,0,0,.45);cursor:pointer;display:none;white-space:nowrap;");
  pill.addEventListener("click", () => setCollapsed(false));

  const panel = el("div",
    "width:300px;max-height:82vh;display:flex;flex-direction:column;background:#16161a;" +
    "border:1px solid #2a2a30;border-radius:12px;box-shadow:0 10px 34px rgba(0,0,0,.5);overflow:hidden;");

  const header = el("div", "display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #2a2a30;");
  const roomLabel = el("div", `flex:1;font:${MONO};color:#9a9aa2;`, "");
  const collapseBtn = el("button", btnCss("transparent", "#9a9aa2") + ";padding:2px 8px;font-size:16px;", "–");
  collapseBtn.title = "Collapse";
  collapseBtn.addEventListener("click", () => setCollapsed(true));
  header.append(el("div", "font-weight:700;color:#fff;", "◆ fossync"), roomLabel, collapseBtn);

  const status = el("div", `padding:7px 12px;font:${MONO};color:#3ddc84;border-bottom:1px solid #2a2a30;`, "connecting…");

  const watching = el("div", "padding:3px 12px 8px;display:flex;flex-direction:column;gap:4px;");
  const feed = el("div", "flex:1;min-height:96px;overflow-y:auto;padding:3px 12px 8px;display:flex;flex-direction:column;gap:4px;");

  const reactions = el("div", "display:flex;gap:8px;padding:8px 12px;border-top:1px solid #2a2a30;opacity:.4;font-size:16px;");
  for (const e of ["😂", "❤️", "😮", "👏", "🔥"]) {
    const r = el("span", "cursor:not-allowed;", e);
    reactions.append(r);
  }
  reactions.append(el("span", `margin-left:auto;align-self:center;font:${MONO};color:#9a9aa2;`, "soon"));

  const chatRow = el("div", "padding:8px 12px;border-top:1px solid #2a2a30;");
  const chatInput = el("input",
    "width:100%;box-sizing:border-box;background:#0f0f12;border:1px solid #2a2a30;border-radius:8px;" +
    `padding:8px 9px;color:#6b6b73;font:${FONT};`) as HTMLInputElement;
  chatInput.placeholder = "💬 Chat coming soon…";
  chatInput.disabled = true;
  chatRow.append(chatInput);

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

  panel.append(header, status, sectionHead("WATCHING"), watching, sectionHead("FEED"), feed, reactions, chatRow, footer);
  root.append(pill, panel);
  document.documentElement.appendChild(root);

  function setCollapsed(c: boolean): void {
    collapsed = c;
    panel.style.display = c ? "none" : "flex";
    pill.style.display = c ? "block" : "none";
  }

  function updatePill(): void {
    pill.textContent = `● ${pillRoom ? "room " + pillRoom : "fossync"} · ${pillCount} watching`;
  }

  return {
    show: () => { root.style.display = "block"; setCollapsed(collapsed); },
    hide: () => { root.style.display = "none"; },
    setRoom: (code) => { pillRoom = code; roomLabel.textContent = "room " + code; updatePill(); },
    setStatus: (text) => { status.textContent = text; },
    setParticipants: (list, youId, hostId) => {
      pillCount = list.length;
      updatePill();
      watching.replaceChildren();
      for (const p of list) {
        const row = el("div", "display:flex;align-items:center;gap:6px;");
        row.append(el("span", "color:#3ddc84;font-size:10px;", "●"));
        row.append(el("span", "color:#e8e8ea;", p.name));
        if (p.id === hostId) row.append(el("span", `font:${MONO};color:#ffd479;`, "host"));
        if (p.id === youId) row.append(el("span", `font:${MONO};color:#9a9aa2;`, "· you"));
        watching.append(row);
      }
    },
    addEvents: (events) => {
      for (const e of events) feed.append(el("div", "color:#b9b9c0;", "— " + e.text));
      while (feed.childElementCount > 100) feed.firstElementChild?.remove();
      feed.scrollTop = feed.scrollHeight;
    },
    setInvite: (url) => { inviteUrl = url; },
    onLeave: (cb) => { leaveCb = cb; },
  };
}
