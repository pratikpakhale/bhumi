import { describe, expect, it } from "vitest";
import { extractCaptcha } from "./viewstate.js";

/**
 * Build a ViewState-shaped buffer containing a `viewCaptcha` StateBag entry:
 *   "viewCaptcha" <0x05> <7-bit length> <ASCII answer>
 * `noise` stands in for the rest of the serialized state around it.
 */
function viewStateWith(answer: string, { marker = true } = {}): string {
  const key = Buffer.from("viewCaptcha", "latin1");
  const body = Buffer.from(answer, "latin1");

  const lengthBytes: number[] = [];
  let len = body.length;
  do {
    let byte = len & 0x7f;
    len >>>= 7;
    if (len > 0) byte |= 0x80;
    lengthBytes.push(byte);
  } while (len > 0);

  const parts = [
    Buffer.from([0x0f, 0x02, 0x01, 0x00]), // leading serialized noise
    key,
    ...(marker ? [Buffer.from([0x05]), Buffer.from(lengthBytes)] : []),
    body,
    Buffer.from([0x10, 0x03]), // trailing noise
  ];
  return Buffer.concat(parts).toString("base64");
}

describe("extractCaptcha", () => {
  it("reads the answer stored beside the viewCaptcha key", () => {
    expect(extractCaptcha(viewStateWith("A1B2C"))).toBe("A1B2C");
  });

  it("handles the full range of captcha lengths the portal uses", () => {
    for (const answer of ["7", "XY", "abc123", "Zq7Lm2Kp"]) {
      expect(extractCaptcha(viewStateWith(answer))).toBe(answer);
    }
  });

  it("decodes multi-byte 7-bit lengths", () => {
    // 130 chars forces a two-byte length prefix (0x82 0x01).
    const long = "x".repeat(130);
    // Longer than the 64-char sanity bound, so it falls back rather than
    // returning a bogus 130-char "answer".
    expect(extractCaptcha(viewStateWith(long))).not.toBe(long);
  });

  it("returns null when the key is absent", () => {
    const noKey = Buffer.from("nothing to see here").toString("base64");
    expect(extractCaptcha(noKey)).toBeNull();
  });

  it("falls back to the printable run when the string marker is missing", () => {
    expect(extractCaptcha(viewStateWith("PLAIN9", { marker: false }))).toBe("PLAIN9");
  });

  it("does not throw on input that is not valid base64", () => {
    expect(() => extractCaptcha("!!!not base64!!!")).not.toThrow();
  });

  it("does not throw on empty input", () => {
    expect(extractCaptcha("")).toBeNull();
  });
});
