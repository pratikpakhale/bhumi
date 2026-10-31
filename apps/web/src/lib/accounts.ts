/**
 * Accounts: a username, a password, and nothing else.
 *
 * An account exists so a saved list can follow its owner to another phone; it
 * holds no email, no phone number, no name. Every record in a collection is
 * one the portal shows anyone, so the account protects the list from being
 * *changed* by someone else, not from being read.
 *
 * Each account is a file in the bucket (see `bucket.ts`), claimed by creating
 * it only if absent. The session is a sealed cookie holding the username, so
 * no session store exists either; signing out on one device does not sign out
 * the others.
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual, type BinaryLike, type ScryptOptions } from "node:crypto";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { BadRequest, Refused } from "./api";
import { readJson, writeJson } from "./bucket";
import { normalizeUsername, passwordProblem, USERNAME, USERNAME_RULE } from "./account-rules";

const scrypt = (password: BinaryLike, salt: BinaryLike, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))),
  );

/** Wrong passwords allowed in a row before the account waits out {@link LOCK_MS}. */
const MAX_FAILURES = 10;
const LOCK_MS = 15 * 60 * 1000;

const YEAR_S = 365 * 24 * 60 * 60;

interface Account {
  username: string;
  /** `scrypt$N$r$p$salt$key`, salt and key base64. */
  password: string;
  createdAt: string;
  failures?: number;
  lockedUntil?: string;
}

interface Session {
  username?: string;
}

const accountKey = (username: string) => `accounts/${username}.json`;

async function session() {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("Accounts are not configured: set SESSION_SECRET to at least 32 random characters.");
  }
  return getIronSession<Session>(await cookies(), {
    password,
    cookieName: "bhumi_account",
    ttl: YEAR_S,
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" },
  });
}

/** Whether this deployment has what accounts need; without it the UI never offers one. */
export const accountsConfigured = (): boolean =>
  ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].every((k) => !!process.env[k]) &&
  (process.env.SESSION_SECRET?.length ?? 0) >= 32;

// ── Passwords ────────────────────────────────────────────────────────────────

const COST = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, COST);
  return ["scrypt", COST.N, COST.r, COST.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, N, r, p, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const want = Buffer.from(key, "base64");
  const got = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64"), want.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(got, want);
}

/** Spent on a sign-in for a name that does not exist, so it takes as long as one that does. */
let decoy: Promise<string> | null = null;

// ── Usernames ────────────────────────────────────────────────────────────────

function checkNew(username: string, password: string): void {
  if (!USERNAME.test(username)) throw new BadRequest(USERNAME_RULE);
  if (!password) throw new BadRequest("Enter a password.");
  const problem = passwordProblem(password);
  if (problem) throw new BadRequest(problem);
}

// ── Operations ───────────────────────────────────────────────────────────────

export async function signUp(rawUsername: string, password: string): Promise<string> {
  const username = normalizeUsername(rawUsername);
  checkNew(username, password);
  const account: Account = { username, password: await hashPassword(password), createdAt: new Date().toISOString() };
  if ((await writeJson(accountKey(username), account, null)) === null) {
    throw new Refused("That username is taken. Try another, or sign in if it is yours.", 409);
  }
  await remember(username);
  return username;
}

export async function signIn(rawUsername: string, password: string): Promise<string> {
  const username = normalizeUsername(rawUsername);
  const wrong = new Refused("That username and password do not match.", 401);
  const found = USERNAME.test(username) ? await readJson<Account>(accountKey(username)) : null;
  if (!found) {
    await checkPassword(password, await (decoy ??= hashPassword("decoy")));
    throw wrong;
  }

  const { value: account, etag } = found;
  if (account.lockedUntil && Date.parse(account.lockedUntil) > Date.now()) {
    throw new Refused("Too many wrong passwords. Wait 15 minutes and try again.", 429);
  }

  if (!(await checkPassword(password, account.password))) {
    const failures = (account.failures ?? 0) + 1;
    // Lost to a concurrent write, the count is merely one short; not worth a retry.
    await writeJson(
      accountKey(username),
      failures >= MAX_FAILURES
        ? { ...account, failures: 0, lockedUntil: new Date(Date.now() + LOCK_MS).toISOString() }
        : { ...account, failures, lockedUntil: undefined },
      etag,
    );
    throw wrong;
  }

  if (account.failures || account.lockedUntil) {
    await writeJson(accountKey(username), { ...account, failures: undefined, lockedUntil: undefined }, etag);
  }
  await remember(username);
  return username;
}

async function remember(username: string): Promise<void> {
  const s = await session();
  s.username = username;
  await s.save();
}

export async function signOut(): Promise<void> {
  (await session()).destroy();
}

/** The signed-in username, or a 401 for the client to act on. */
export async function requireUser(): Promise<string> {
  const { username } = await session();
  if (!username) throw new Refused("Sign in to sync your saved records.", 401);
  return username;
}
