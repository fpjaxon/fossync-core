import { describe, it, expect } from "vitest";
import { encodeBrandedFragment, decodeBranded } from "./branded";

describe("branded share-link format", () => {
  it("round-trips a page URL + code through encode/decode", () => {
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    const frag = encodeBrandedFragment(url, "ABC123");
    expect(decodeBranded(frag)).toEqual({ url, code: "ABC123" });
  });

  it("round-trips an encryption key for an encrypted session", () => {
    const url = "https://x.test/watch?v=1";
    const frag = encodeBrandedFragment(url, "ABC123", "thekey_-09");
    expect(decodeBranded(frag)).toEqual({ url, code: "ABC123", key: "thekey_-09" });
  });

  it("omits the key for a plaintext session (no k in the fragment)", () => {
    const frag = encodeBrandedFragment("https://x.test/", "ABC123");
    expect(frag).not.toContain("k=");
    expect(decodeBranded(frag)).toEqual({ url: "https://x.test/", code: "ABC123" });
  });

  it("strips any existing hash from the page URL before encoding", () => {
    const frag = encodeBrandedFragment("https://x.test/watch?v=1#vsync=OLD", "NEW999");
    expect(decodeBranded(frag)).toEqual({ url: "https://x.test/watch?v=1", code: "NEW999" });
  });

  it("survives non-ASCII characters in the URL (UTF-8 safe)", () => {
    const url = "https://x.test/搜索?q=café";
    const decoded = decodeBranded(encodeBrandedFragment(url, "Z9Z9Z9"));
    expect(decoded?.url).toBe(new URL(url).toString());
    expect(decoded?.code).toBe("Z9Z9Z9");
  });

  it("decodes a fragment that still has a leading #", () => {
    const frag = "#" + encodeBrandedFragment("https://x.test/", "AAA111");
    expect(decodeBranded(frag)?.code).toBe("AAA111");
  });

  it("rejects a non-https destination (open-redirect / javascript: guard)", () => {
    // hand-build a fragment whose decoded URL is javascript: / http:
    const evil = (raw: string) => {
      const b64 = btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      return `vsync=ABC123&u=${b64}`;
    };
    expect(decodeBranded(evil("javascript:alert(1)"))).toBeNull();
    expect(decodeBranded(evil("http://insecure.test/"))).toBeNull();
    expect(decodeBranded(evil("data:text/html,<h1>x"))).toBeNull();
  });

  it("rejects malformed fragments", () => {
    expect(decodeBranded("")).toBeNull();
    expect(decodeBranded("vsync=ABC123")).toBeNull(); // no u
    expect(decodeBranded("u=aaaa")).toBeNull(); // no code
    expect(decodeBranded("vsync=ABC123&u=not_valid_base64_url_$$$")).toBeNull();
  });
});
