import { describe, it, expect, vi } from "vitest";
import { getOrCreateName, setName, NAME_KEY, type NameStorage } from "./name-store";

function fakeStorage(initial: Record<string, string> = {}): NameStorage & { data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    get: async (key: string) => data[key],
    set: async (key: string, value: string) => { data[key] = value; },
  };
}

describe("name-store", () => {
  it("returns the saved name without generating when one exists", async () => {
    const storage = fakeStorage({ [NAME_KEY]: "CalmFox" });
    const generate = vi.fn(() => "ShouldNotBeUsed");
    const name = await getOrCreateName(storage, generate);
    expect(name).toBe("CalmFox");
    expect(generate).not.toHaveBeenCalled();
  });

  it("generates and saves a name when none exists", async () => {
    const storage = fakeStorage();
    const name = await getOrCreateName(storage, () => "SwiftOtter");
    expect(name).toBe("SwiftOtter");
    expect(storage.data[NAME_KEY]).toBe("SwiftOtter");
  });

  it("setName overwrites the saved name", async () => {
    const storage = fakeStorage({ [NAME_KEY]: "SwiftOtter" });
    await setName(storage, "MyName");
    expect(storage.data[NAME_KEY]).toBe("MyName");
  });
});
