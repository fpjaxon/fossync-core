import { browser } from "wxt/browser";

// browser.storage.local accessor for the "encrypted session" creation preference,
// mirroring branded-store.ts. This is just the default for the popup toggle; the
// actual session key lives only in the share-link fragment, never in storage.
export const ENCRYPTED_KEY = "encryptedSessions";

export async function getEncryptedDefault(): Promise<boolean> {
  try {
    const stored = await browser.storage.local.get(ENCRYPTED_KEY);
    return stored[ENCRYPTED_KEY] === true;
  } catch {
    return false;
  }
}

export async function setEncryptedDefault(on: boolean): Promise<void> {
  await browser.storage.local.set({ [ENCRYPTED_KEY]: on });
}
