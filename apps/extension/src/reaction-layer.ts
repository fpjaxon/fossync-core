import { browser } from "wxt/browser";
import { assetPath } from "./emoji-assets";

// WXT omits runtime.getURL from its typed `browser` (it's normally re-added via
// auto-imports, which this standalone tsconfig disables); it exists at runtime.
const runtime = browser.runtime as unknown as { getURL(path: string): string };

// Full-screen reaction overlay: emoji launch from the bottom edge and rise up
// the viewport with sideways drift, scale + fade. Lives inside the sidebar's
// click-through root, so it stays pointer-transparent and follows the page into
// fullscreen. Reactions are animated WebP (with a native-glyph fallback).

const MAX_LIVE = 24; // cap concurrent nodes so a reaction storm can't thrash the page

export interface ReactionLayer {
  readonly element: HTMLElement;
  spawn(emoji: string): void;
}

function makeIcon(emoji: string, size: number): HTMLElement {
  const path = assetPath(emoji);
  if (path) {
    const img = document.createElement("img");
    img.src = runtime.getURL(path);
    img.alt = emoji;
    img.style.cssText = `width:${size}px;height:${size}px;display:block;`;
    // Asset missing/blocked → swap in the native glyph in place so a reaction
    // always shows something.
    img.addEventListener("error", () => {
      const span = document.createElement("span");
      span.textContent = emoji;
      span.style.cssText = `font-size:${size}px;line-height:1;`;
      img.replaceWith(span);
    });
    return img;
  }
  const span = document.createElement("span");
  span.textContent = emoji;
  span.style.cssText = `font-size:${size}px;line-height:1;`;
  return span;
}

export function createReactionLayer(): ReactionLayer {
  const layer = document.createElement("div");
  layer.style.cssText = "position:absolute;inset:0;overflow:hidden;pointer-events:none;";

  function spawn(emoji: string): void {
    while (layer.childElementCount >= MAX_LIVE) {
      const oldest = layer.firstElementChild as HTMLElement | null;
      if (!oldest) break;
      oldest.getAnimations().forEach((a) => a.cancel());
      oldest.remove();
    }

    const size = 34 + Math.round(Math.random() * 12); // 34–46px, for a little depth
    const x = 5 + Math.random() * 90; // vw
    const node = document.createElement("div");
    node.style.cssText =
      `position:absolute;left:${x}vw;bottom:-8px;transform:translate(-50%,0);` +
      "pointer-events:none;will-change:transform,opacity;filter:drop-shadow(0 2px 6px rgba(0,0,0,.45));";
    node.append(makeIcon(emoji, size));
    layer.append(node);

    const dx = (Math.random() - 0.5) * 160; // horizontal drift
    const rise = 60 + Math.random() * 30; // vh travelled
    const duration = 2200 + Math.random() * 1200;
    const anim = node.animate(
      [
        { transform: "translate(-50%,0) scale(.4)", opacity: 0 },
        { transform: "translate(-50%,-10vh) scale(1)", opacity: 1, offset: 0.16 },
        { transform: `translate(calc(-50% + ${dx}px),-${rise}vh) scale(1.05)`, opacity: 0 },
      ],
      { duration, easing: "ease-out" },
    );
    anim.onfinish = () => node.remove();
  }

  return { element: layer, spawn };
}
