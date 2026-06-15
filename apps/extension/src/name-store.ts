export interface NameStorage {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
}

export const NAME_KEY = "displayName";

export async function getOrCreateName(
  storage: NameStorage,
  generate: () => string,
): Promise<string> {
  const existing = await storage.get(NAME_KEY);
  if (existing) return existing;
  const name = generate();
  await storage.set(NAME_KEY, name);
  return name;
}

export async function setName(storage: NameStorage, name: string): Promise<void> {
  await storage.set(NAME_KEY, name);
}
