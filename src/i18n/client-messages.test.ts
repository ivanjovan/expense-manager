import { describe, expect, it } from "vitest";
import en from "./messages/en.json";
import srLatn from "./messages/sr-Latn.json";
import { SERVER_ONLY_MESSAGE_PATHS, pickClientMessages } from "./client-messages";

type Tree = Record<string, unknown>;

describe("pickClientMessages", () => {
  it("drops every server-only subtree", () => {
    const trimmed = pickClientMessages(en) as Tree;
    for (const [namespace, key] of SERVER_ONLY_MESSAGE_PATHS) {
      expect((trimmed[namespace] as Tree)[key]).toBeUndefined();
    }
  });

  it("keeps the client-facing keys of a partially trimmed namespace", () => {
    const trimmed = pickClientMessages(en) as Tree;
    // ExportButton renders these.
    for (const key of ["fullButton", "vehicleButton", "accountButton", "preparing", "failed"]) {
      expect((trimmed.export as Tree)[key]).toBeTypeOf("string");
    }
  });

  it("leaves untouched namespaces alone", () => {
    const trimmed = pickClientMessages(en) as Tree;
    expect(trimmed.nav).toEqual((en as Tree).nav);
    expect(trimmed.validation).toEqual((en as Tree).validation);
  });

  it("does not mutate the source bundle", () => {
    const before = JSON.stringify(en);
    pickClientMessages(en);
    expect(JSON.stringify(en)).toBe(before);
  });

  /**
   * The filter is a hardcoded list of paths. If a namespace is renamed, the
   * entries silently stop matching and the trimming quietly reverts to
   * shipping everything — no error, just a bigger payload. This catches that.
   */
  it("every configured path still exists in both locales", () => {
    for (const messages of [en as Tree, srLatn as Tree]) {
      for (const [namespace, key] of SERVER_ONLY_MESSAGE_PATHS) {
        expect(messages[namespace], `missing namespace: ${namespace}`).toBeTypeOf("object");
        expect(
          (messages[namespace] as Tree)[key],
          `missing path: ${namespace}.${key}`
        ).toBeTypeOf("object");
      }
    }
  });
});
