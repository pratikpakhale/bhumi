/**
 * HTTPS to the state's land portals, surviving a lapsed certificate.
 *
 * Mahabhulekh and Bhunaksha share one `*.mahabhumi.gov.in` certificate, and it
 * is renewed by hand: when it lapses, both portals keep serving behind an
 * expired certificate until someone notices, and every request from here fails
 * though nothing else about the connection is wrong. Renewal is theirs to do.
 * What this module does is keep Bhumi working through the gap, and return to
 * ordinary verification on its own the moment a renewed certificate is served.
 *
 * Every connection is verified normally first. Only when the *sole* complaint is
 * that the certificate has expired is it looked at again, and then everything
 * else is still demanded: the host must be a mahabhumi.gov.in host and match the
 * certificate, every signature in the chain must check out up to a root Node
 * trusts, every issuer must be a CA and in date, and the certificate must have
 * expired recently. What is waived is the expiry date alone, for a bounded time.
 */

import { X509Certificate } from "node:crypto";
import { rootCertificates, type TLSSocket } from "node:tls";
import { Agent, buildConnector, fetch as undiciFetch } from "undici";

/** The hosts the waiver can apply to. Anything else is verified strictly. */
const PORTAL_HOST = /(^|\.)mahabhumi\.gov\.in$/i;

/**
 * How long after expiry a certificate is still accepted. Long enough to ride
 * out a slow manual renewal; bounded so a certificate whose key may since have
 * been retired is not trusted indefinitely.
 */
export const EXPIRY_GRACE_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

let roots: X509Certificate[] | null = null;
const trustedRoots = () => (roots ??= rootCertificates.map((pem) => new X509Certificate(pem)));

const inDate = (cert: X509Certificate, now: Date) =>
  now >= new Date(cert.validFrom) && now <= new Date(cert.validTo);

/**
 * Why an expired chain should still be refused, or `null` to accept it.
 *
 * `chain` is leaf first, as the server presented it. Exported for testing.
 */
export function lapsedChainProblem(
  chain: readonly X509Certificate[],
  host: string,
  now = new Date(),
  anchors: readonly X509Certificate[] = trustedRoots(),
): string | null {
  const [leaf] = chain;
  if (!leaf) return "no certificate";
  if (!PORTAL_HOST.test(host)) return `${host} is not a portal host`;
  if (!leaf.checkHost(host)) return `certificate is not for ${host}`;
  if (now < new Date(leaf.validFrom)) return "certificate is not yet valid";
  if (now.getTime() - new Date(leaf.validTo).getTime() > EXPIRY_GRACE_DAYS * DAY_MS) {
    return "certificate expired too long ago";
  }

  for (let i = 0; i < chain.length; i++) {
    const cert = chain[i]!;
    const anchor = anchors.find((r) => cert.checkIssued(r) && cert.verify(r.publicKey));
    if (anchor) return inDate(anchor, now) ? null : "root certificate is out of date";
    const issuer = chain[i + 1];
    if (!issuer || !issuer.ca || !cert.checkIssued(issuer) || !cert.verify(issuer.publicKey)) {
      return "certificate chain is broken";
    }
    if (!inDate(issuer, now)) return "intermediate certificate is out of date";
  }
  return "certificate chain is not trusted";
}

/** The chain the server presented, leaf first. */
function presentedChain(socket: TLSSocket): X509Certificate[] {
  const chain: X509Certificate[] = [];
  const seen = new Set<string>();
  for (
    let cert = socket.getPeerCertificate(true);
    cert?.raw && !seen.has(cert.fingerprint256);
    cert = cert.issuerCertificate
  ) {
    seen.add(cert.fingerprint256);
    chain.push(new X509Certificate(cert.raw));
  }
  return chain;
}

// No session resumption: a resumed handshake presents no certificate, so there
// would be nothing to check. Kept-alive sockets are still reused.
const connectTls = buildConnector({ rejectUnauthorized: false, maxCachedSessions: 0 });

const agent = new Agent({
  connect(opts, callback) {
    connectTls(opts, (err, socket) => {
      if (err) return callback(err, null);
      const tls = socket as TLSSocket;
      // A fully verified connection — hostname included — needs nothing more.
      if (tls.authorized || !tls.encrypted) return callback(null, socket);
      const host = opts.servername || opts.hostname;
      const problem =
        tls.authorizationError?.toString() === "CERT_HAS_EXPIRED"
          ? lapsedChainProblem(presentedChain(tls), host)
          : String(tls.authorizationError);
      if (!problem) return callback(null, socket);
      socket.destroy();
      callback(new Error(`TLS to ${host} refused: ${problem}`), null);
    });
  },
});

/** `fetch` for the portals: see the module comment. */
export const portalFetch: typeof fetch = (input, init) =>
  undiciFetch(input as Parameters<typeof undiciFetch>[0], {
    ...(init as Parameters<typeof undiciFetch>[1]),
    dispatcher: agent,
  }) as unknown as Promise<Response>;
