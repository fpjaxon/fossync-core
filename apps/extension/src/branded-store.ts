import { browser } from "wxt/browser";
import { BRANDED_KEY } from "./branded";

// browser.storage.local accessor for the "branded share links" toggle. Split from
// branded.ts (which stays pure/testable) the same way relay.ts splits relay-url.ts.

/**
 * Whether the user has branded share links enabled. Always false unless the
 * feature was compiled in (`__BRANDED__`), so non-branded builds short-circuit
 * before ever touching storage — and the rest of this function dead-strips away.
 */
export async function getBrandedUrls(): Promise<boolean> {
  if (!__BRANDED__) return false;
  try {
    const stored = await browser.storage.local.get(BRANDED_KEY);
    return stored[BRANDED_KEY] === true;
  } catch {
    return false;
  }
}

export async function setBrandedUrls(on: boolean): Promise<void> {
  await browser.storage.local.set({ [BRANDED_KEY]: on });
}
