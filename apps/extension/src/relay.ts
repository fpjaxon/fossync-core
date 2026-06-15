import { browser } from "wxt/browser";
import { relayFromOrigin, type Relay } from "./relay-url";

export { relayFromOrigin, normalizeRelayUrl } from "./relay-url";
export type { Relay } from "./relay-url";

// Stored https/http origin of the relay; absent/"" means the official default.
const RELAY_KEY = "relayHttpOrigin";

export async function getRelay(): Promise<Relay> {
  try {
    const stored = await browser.storage.local.get(RELAY_KEY);
    const v = stored[RELAY_KEY];
    return relayFromOrigin(typeof v === "string" ? v : "");
  } catch {
    return relayFromOrigin("");
  }
}

export async function setRelayOrigin(httpOrigin: string): Promise<void> {
  await browser.storage.local.set({ [RELAY_KEY]: httpOrigin });
}

export async function resetRelay(): Promise<void> {
  await browser.storage.local.remove(RELAY_KEY);
}
