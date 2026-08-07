import { describe, expect, it } from "vitest";
import en from "./messages/en.json";
import srLatn from "./messages/sr-Latn.json";

/**
 * SRS §7: "CI fails on any key present in en.json but missing from
 * sr-Latn.json, and on unused keys." This covers the first half — key
 * parity between locale files. Unused-key detection would need a scan of
 * every t(...) call site across the app and is left for a later phase.
 */

type MessageTree = { [key: string]: string | MessageTree };

function flattenKeys(obj: MessageTree, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : flattenKeys(value, path);
  });
}

describe("i18n message parity", () => {
  const enKeys = flattenKeys(en).sort();
  const srKeys = flattenKeys(srLatn).sort();

  it("sr-Latn has every key en has", () => {
    const missing = enKeys.filter((k) => !srKeys.includes(k));
    expect(missing).toEqual([]);
  });

  it("sr-Latn has no extra keys en doesn't have", () => {
    const extra = srKeys.filter((k) => !enKeys.includes(k));
    expect(extra).toEqual([]);
  });

  it("has no empty translated values", () => {
    const empties = srKeys.filter((key) => {
      const value = key
        .split(".")
        .reduce<unknown>((node, segment) => (node as MessageTree)[segment], srLatn);
      return typeof value === "string" && value.trim() === "";
    });
    expect(empties).toEqual([]);
  });
});
