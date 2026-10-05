/**
 * The network clients. Node only: they reach the portals through
 * {@link portalFetch}, which needs Node's TLS. Everything browser-safe is in
 * `@bhumi/core`.
 */

export { MahabhulekhClient } from "./client.js";
export { Session } from "./session.js";
export { BhunakshaClient } from "./bhunaksha.js";
export { portalFetch, EXPIRY_GRACE_DAYS } from "./tls.js";
// Decodes ViewState with Node's Buffer, so it is server-only too.
export { extractCaptcha } from "./viewstate.js";
