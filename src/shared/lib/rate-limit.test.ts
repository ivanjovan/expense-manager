import { beforeEach, describe, expect, it } from "vitest";
import { hit, hitAll, resetRateLimits } from "./rate-limit";

beforeEach(() => {
  resetRateLimits();
});

const WINDOW = 60_000;

describe("hit", () => {
  it("allows attempts up to the limit and rejects the next one", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(hit("k", 3, WINDOW, now).allowed).toBe(true);
    }
    expect(hit("k", 3, WINDOW, now).allowed).toBe(false);
  });

  it("reports how long the caller has to wait", () => {
    const now = 1_000_000;
    hit("k", 1, WINDOW, now);
    const rejected = hit("k", 1, WINDOW, now + 15_000);
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterSeconds).toBe(45);
  });

  it("starts a fresh window once the old one expires", () => {
    const now = 1_000_000;
    hit("k", 1, WINDOW, now);
    expect(hit("k", 1, WINDOW, now + WINDOW).allowed).toBe(true);
  });

  it("keeps separate keys independent", () => {
    const now = 1_000_000;
    hit("a", 1, WINDOW, now);
    expect(hit("a", 1, WINDOW, now).allowed).toBe(false);
    expect(hit("b", 1, WINDOW, now).allowed).toBe(true);
  });

  it("keeps rejecting while the window is still open, rather than resetting", () => {
    const now = 1_000_000;
    hit("k", 1, WINDOW, now);
    for (let i = 0; i < 5; i++) {
      expect(hit("k", 1, WINDOW, now + 1_000 * i).allowed).toBe(false);
    }
  });
});

describe("hitAll", () => {
  const windows = [
    { name: "burst", limit: 2, windowMs: 1_000 },
    { name: "daily", limit: 3, windowMs: 100_000 },
  ];

  it("rejects on the short window first", () => {
    const now = 1_000_000;
    expect(hitAll("u", windows, now).allowed).toBe(true);
    expect(hitAll("u", windows, now).allowed).toBe(true);
    expect(hitAll("u", windows, now).allowed).toBe(false);
  });

  it("still enforces the long window after the short one resets", () => {
    let now = 1_000_000;
    hitAll("u", windows, now); // daily 1
    hitAll("u", windows, now); // daily 2
    now += 1_000; // burst window rolls over, daily does not
    expect(hitAll("u", windows, now).allowed).toBe(true); // daily 3
    expect(hitAll("u", windows, now).allowed).toBe(false); // daily exhausted
  });

  it("keeps separate subjects independent", () => {
    const now = 1_000_000;
    hitAll("a", windows, now);
    hitAll("a", windows, now);
    expect(hitAll("a", windows, now).allowed).toBe(false);
    expect(hitAll("b", windows, now).allowed).toBe(true);
  });
});
