import { describe, expect, it } from "vitest";
import { localeFromPrisma, resolveLocale } from "./resolve-locale";

/**
 * These guard a bug that produced no error at all: /api routes sit outside
 * the `/[locale]/` segment, so next-intl found no locale and quietly used
 * the default — every export came out in English regardless of the language
 * the user was reading.
 */

describe("localeFromPrisma", () => {
  it("maps the Prisma enum to locale tags", () => {
    expect(localeFromPrisma("SR_LATN")).toBe("sr-Latn");
    expect(localeFromPrisma("EN")).toBe("en");
  });

  it("returns undefined for anything unrecognized", () => {
    expect(localeFromPrisma(null)).toBeUndefined();
    expect(localeFromPrisma(undefined)).toBeUndefined();
    expect(localeFromPrisma("DE")).toBeUndefined();
  });
});

describe("resolveLocale", () => {
  it("prefers the explicitly requested locale", () => {
    // The switcher changes the URL without persisting, so this is the only
    // source that reflects a mid-session language change.
    expect(resolveLocale("sr-Latn", "EN")).toBe("sr-Latn");
  });

  it("accepts the default locale explicitly", () => {
    expect(resolveLocale("en", "SR_LATN")).toBe("en");
  });

  it("falls back to the stored preference when none is requested", () => {
    expect(resolveLocale(null, "SR_LATN")).toBe("sr-Latn");
    expect(resolveLocale(undefined, "SR_LATN")).toBe("sr-Latn");
  });

  it("ignores an unsupported requested locale", () => {
    // Query params are untrusted; an unknown tag must not reach next-intl.
    expect(resolveLocale("de", "SR_LATN")).toBe("sr-Latn");
    expect(resolveLocale("../../etc/passwd", "SR_LATN")).toBe("sr-Latn");
  });

  it("falls back to the default when nothing is known", () => {
    expect(resolveLocale(null, null)).toBe("en");
    expect(resolveLocale("", undefined)).toBe("en");
  });
});
