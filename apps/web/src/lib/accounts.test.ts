import { describe, expect, it } from "vitest";
import { checkPassword, hashPassword } from "./accounts";
import { normalizeUsername, passwordProblem, USERNAME } from "./account-rules";

describe("passwords", () => {
  it("checks a password against its own hash only", async () => {
    const stored = await hashPassword("माझी जमीन 167");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(await checkPassword("माझी जमीन 167", stored)).toBe(true);
    expect(await checkPassword("माझी जमीन 168", stored)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("refuses a stored value it does not recognise", async () => {
    expect(await checkPassword("x", "bcrypt$whatever")).toBe(false);
  });

  it("may be anything typeable without spaces", () => {
    for (const ok of ["1", "abc", "माझीजमीन१६७", "p@ss!word#$%^&*()"]) expect(passwordProblem(ok)).toBeNull();
    for (const bad of ["two words", " lead", "tab\there", "new\nline", "bell\u0007", "x".repeat(201)]) {
      expect(passwordProblem(bad)).not.toBeNull();
    }
  });
});

describe("usernames", () => {
  it("are one name however they are typed", () => {
    expect(normalizeUsername("  Pratik.P ")).toBe("pratik.p");
  });

  it("are short, plain and start with a letter or digit", () => {
    expect(USERNAME.test("pratik")).toBe(true);
    expect(USERNAME.test("ab")).toBe(false);
    expect(USERNAME.test(".pratik")).toBe(false);
    expect(USERNAME.test("pra tik")).toBe(false);
    expect(USERNAME.test("../etc")).toBe(false);
  });
});
