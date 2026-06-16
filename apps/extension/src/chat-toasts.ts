import { C, FONT } from "./theme";

// Chat toasts shown when the sidebar is collapsed: small frosted cards stacked
// on the right edge just above the logo sphere. Newest sits closest to the
// sphere; the stack grows upward. Auto-dismiss; click to open the panel.

const VISIBLE_MAX = 3;
const TTL_MS = 5200;

export interface ChatToasts {
  readonly element: HTMLElement;
  /** Show a toast. `name` is the sender; `text` is rendered as text (never HTML). */
  push(name: string, text: string): void;
  /** Remove all toasts (e.g. when the panel is opened). */
  clear(): void;
  onOpen(cb: () => void): void;
}

export function createChatToasts(): ChatToasts {
  let openCb: (() => void) | null = null;
  // Bottom-anchored, above the sphere (sphere sits at bottom:15%, ~32px tall).
  const stack = document.createElement("div");
  stack.style.cssText =
    "position:absolute;right:16px;bottom:calc(15% + 44px);display:flex;flex-direction:column;" +
    "gap:8px;align-items:flex-end;pointer-events:none;max-width:280px;";

  function dismiss(card: HTMLElement): void {
    const timer = Number(card.dataset.timer);
    if (timer) window.clearTimeout(timer);
    card.style.opacity = "0";
    card.style.transform = "translateX(16px)";
    window.setTimeout(() => card.remove(), 240);
  }

  function push(name: string, text: string): void {
    const card = document.createElement("div");
    card.style.cssText =
      "pointer-events:auto;cursor:pointer;max-width:260px;box-sizing:border-box;" +
      `background:rgba(22,22,26,.92);border:1px solid ${C.border};border-radius:12px;` +
      "padding:8px 11px;box-shadow:0 8px 24px rgba(0,0,0,.5);backdrop-filter:blur(8px);" +
      `-webkit-backdrop-filter:blur(8px);font:${FONT};color:${C.text};` +
      "opacity:0;transform:translateX(16px);transition:opacity .22s ease,transform .22s ease;";

    const who = document.createElement("div");
    who.style.cssText = `color:${C.blue};font-weight:600;margin-bottom:1px;`;
    who.textContent = name;

    const body = document.createElement("div");
    body.style.cssText =
      "word-break:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;";
    body.textContent = text; // textContent — never interpret message HTML

    card.append(who, body);
    card.addEventListener("click", () => openCb?.());
    stack.append(card);

    // Drop the oldest (top) cards beyond the visible cap.
    while (stack.childElementCount > VISIBLE_MAX) stack.firstElementChild?.remove();

    // Enter animation on the next frame.
    requestAnimationFrame(() => {
      card.style.opacity = "1";
      card.style.transform = "translateX(0)";
    });

    card.dataset.timer = String(window.setTimeout(() => dismiss(card), TTL_MS));
  }

  function clear(): void {
    for (const child of Array.from(stack.children)) {
      const timer = Number((child as HTMLElement).dataset.timer);
      if (timer) window.clearTimeout(timer);
    }
    stack.replaceChildren();
  }

  return {
    element: stack,
    push,
    clear,
    onOpen: (cb) => { openCb = cb; },
  };
}
