# Accounts and sync on R2, with no database

Status: accepted, 2026-10-31

## Context

The saved collection lived only in the browser's `localStorage`. It reached
another device only by a share link or an exported file. People asked to save
their lands once and see them on every device.

Until now the collection was deliberately not tied to an account, so that no
server would hold a map of families to their land. That reason no longer
applies: every record in a collection is one the portal serves to anyone who
asks, so the list itself is public information. What an account has to protect
is the list's integrity (nobody else can change it), not its secrecy.

## Decision

- **An account is a username and a password, and nothing else.** There is no
  email, no phone number and no third-party sign-in.
  - Google sign-in was ruled out: it needs a client ID and console setup, and
    it adds a dependency.
  - Phone OTP was ruled out: SMS in India needs DLT registration and costs
    money per message.
  - The cost of this choice: there is no password reset.
- **Storage is one R2 bucket, `bhumi`, with no database.**
  - `bhumi/accounts/<username>.json` holds the scrypt hash and the
    failed-attempt counter.
  - `bhumi/collections/<username>.json` holds the collection, in the same
    `CollectionState` shape the device stores.
  - Consistency comes from R2's conditional writes:
    - A username is claimed with `If-None-Match: *`.
    - A collection is replaced with `If-Match: <etag>`.
    - When a conditional write fails, the server returns the current copy, and
      the client merges against it and tries again.
- **Sessions are a sealed cookie** (iron-session, one year) holding the
  username, so there is no session store.
  - Signing out clears the cookie on that one device only.
  - Rotating `SESSION_SECRET` signs out everyone.
- **The device stays the source of truth.** The account is a second copy, and
  the client merges it in (`combine` in `collection.ts`):
  - Each entry is last-writer-wins on `updatedAt`.
  - A removal leaves a tombstone, so a device that still holds the land cannot
    bring it back.
  - The order is a single last-writer-wins value (`orderedAt`).
- **Signing in merges the device's list into the account.** A list kept before
  signing up is not lost.
- **Accounts change nothing for anyone who doesn't use them.** A device makes no
  account request unless it has signed in. A deployment without the R2
  variables never offers an account at all.
- **Signing out only stops the syncing.** The list stays on the device as it
  was, and stays in the account too. The cost: on a shared phone, the next
  person to sign in merges that list into their own account.
- **Offline copies of records never sync.** They are megabytes per record, and
  each device fetches its own.

## Consequences

- There is nothing to provision beyond a bucket, a bucket-scoped R2 token and a
  random secret, and R2's free tier covers this load.
- A forgotten password loses access to the account's copy, though each device
  keeps its own.
- Brute force is limited per account: after 10 wrong passwords in a row, the
  account is locked for 15 minutes. There is no per-IP limit.
- Last-writer-wins trusts device clocks. A badly skewed clock can let an older
  edit win. For nicknames on a land list, that is acceptable.
- Tombstones are never pruned. They are a few dozen bytes each.
