/**
 * The portal stores the current captcha's expected answer *inside* the
 * (unencrypted, unvalidated) `__VIEWSTATE` as a StateBag entry keyed
 * `viewCaptcha`. Because MAC validation is disabled, the answer is readable
 * client-side, so the visual captcha provides no real protection.
 *
 * We read that value rather than solving the image. This is a weakness in the
 * portal itself; see the project README.
 *
 * StateBag serialization for the entry is:
 *   "viewCaptcha" <0x05 string-marker> <7-bit-encoded length> <ASCII bytes>
 */

/** Extract the expected captcha answer embedded in a base64 `__VIEWSTATE`. */
export function extractCaptcha(viewStateBase64: string): string | null {
  let buf: Buffer;
  try {
    buf = Buffer.from(viewStateBase64, "base64");
  } catch {
    return null;
  }
  const key = Buffer.from("viewCaptcha", "latin1");
  const at = buf.indexOf(key);
  if (at < 0) return null;

  let p = at + key.length;
  // Expect the string type marker (0x05). If it's absent, fall back to a
  // best-effort scan of the following printable run.
  if (buf[p] === 0x05) {
    p += 1;
    const { value: len, next } = read7BitInt(buf, p);
    if (len > 0 && len <= 64 && next + len <= buf.length) {
      return buf.toString("latin1", next, next + len);
    }
  }
  // Fallback: take the printable token immediately after the key.
  const tail = buf
    .toString("latin1", at + key.length, at + key.length + 24)
    .replace(/[^\x21-\x7e]/g, " ")
    .trim();
  return tail.split(/\s+/)[0] || null;
}

/** Read a .NET 7-bit-encoded (LEB128-style) integer. */
function read7BitInt(buf: Buffer, offset: number): { value: number; next: number } {
  let value = 0;
  let shift = 0;
  let p = offset;
  while (p < buf.length) {
    const byte = buf[p]!;
    value |= (byte & 0x7f) << shift;
    p += 1;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return { value, next: p };
}
