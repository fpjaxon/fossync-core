// Shared visual tokens for the in-page overlay (sidebar, reaction layer, chat
// toasts). The popup keeps its own <style> block but mirrors these values so the
// two surfaces read as one product.

export const C = {
  bg: "#16161a",
  bgInput: "#0f0f12",
  border: "#2a2a30",
  text: "#e8e8ea",
  muted: "#9a9aa2",
  faint: "#6b6b73",
  green: "#3ddc84",
  blue: "#7ab8ff",
  warn: "#ffd479",
  danger: "#ff6b6b",
} as const;

export const FONT = "13px/1.45 system-ui,-apple-system,sans-serif";
export const MONO = "12px ui-monospace,monospace";
