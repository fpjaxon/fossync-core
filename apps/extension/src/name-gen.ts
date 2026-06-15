export const ADJECTIVES = [
  "Swift", "Calm", "Bold", "Bright", "Quiet", "Brave", "Clever", "Gentle",
  "Lucky", "Merry", "Nimble", "Sunny", "Witty", "Zesty", "Mellow", "Plucky",
] as const;

export const ANIMALS = [
  "Otter", "Fox", "Heron", "Lynx", "Panda", "Robin", "Tiger", "Wolf",
  "Falcon", "Badger", "Beaver", "Marten", "Osprey", "Raven", "Seal", "Stoat",
] as const;

function pick<T>(items: readonly T[], rand: () => number): T {
  return items[Math.floor(rand() * items.length)]!;
}

export function randomName(rand: () => number = Math.random): string {
  return `${pick(ADJECTIVES, rand)}${pick(ANIMALS, rand)}`;
}
