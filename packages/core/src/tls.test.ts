import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { describe, expect, it } from "vitest";
import { lapsedChainProblem } from "./tls.js";

/** The chain both portals served after their certificate lapsed on 4 Oct 2026. */
const chain = readFileSync(new URL("./fixtures/mahabhumi-chain.pem", import.meta.url), "utf8")
  .split(/(?<=-----END CERTIFICATE-----)/)
  .filter((pem) => pem.includes("BEGIN"))
  .map((pem) => new X509Certificate(pem.trim()));

const HOST = "bhulekh.mahabhumi.gov.in";
const lapsed = new Date("2026-10-05T00:00:00Z");

describe("lapsedChainProblem", () => {
  it("accepts a recently expired chain that is otherwise valid", () => {
    expect(lapsedChainProblem(chain, HOST, lapsed)).toBeNull();
    expect(lapsedChainProblem(chain, "mahabhunakasha.mahabhumi.gov.in", lapsed)).toBeNull();
  });

  it("refuses hosts other than the portals", () => {
    expect(lapsedChainProblem(chain, "example.com", lapsed)).toMatch(/not a portal host/);
  });

  it("refuses a portal host the certificate does not name", () => {
    expect(lapsedChainProblem(chain, "a.b.mahabhumi.gov.in", lapsed)).toMatch(/not for/);
  });

  it("stops waiving expiry once the grace period is over", () => {
    expect(lapsedChainProblem(chain, HOST, new Date("2027-06-01T00:00:00Z"))).toMatch(/too long ago/);
  });

  it("refuses a chain with a missing link", () => {
    expect(lapsedChainProblem([chain[0]!, chain[2]!], HOST, lapsed)).toMatch(/broken/);
  });

  it("refuses a chain that ends at an untrusted root", () => {
    expect(lapsedChainProblem(chain, HOST, lapsed, [])).toMatch(/broken|not trusted/);
  });
});
