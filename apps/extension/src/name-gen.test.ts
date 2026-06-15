import { describe, it, expect } from "vitest";
import { randomName, ADJECTIVES, ANIMALS } from "./name-gen";

// Deterministic RNG: returns each value in turn (one call per word).
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe("randomName", () => {
  it("combines an adjective and an animal in CamelCase", () => {
    expect(randomName(seq([0, 0]))).toBe(`${ADJECTIVES[0]}${ANIMALS[0]}`);
  });

  it("selects words by the rand source", () => {
    const name = randomName(seq([3 / ADJECTIVES.length, 5 / ANIMALS.length]));
    expect(name).toBe(`${ADJECTIVES[3]}${ANIMALS[5]}`);
  });

  it("stays in range when the rand source is near 1", () => {
    const name = randomName(seq([0.999, 0.999]));
    expect(name).toBe(`${ADJECTIVES.at(-1)}${ANIMALS.at(-1)}`);
  });
});
