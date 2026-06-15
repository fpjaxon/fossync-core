import { browser } from "wxt/browser";
import type { NameStorage } from "./name-store";

// browser.storage.local exposed through the NameStorage interface, shared by the
// popup and the content script.
export const localNameStorage: NameStorage = {
  async get(key) {
    const result = await browser.storage.local.get(key);
    const value = result[key];
    return typeof value === "string" ? value : undefined;
  },
  async set(key, value) {
    await browser.storage.local.set({ [key]: value });
  },
};
