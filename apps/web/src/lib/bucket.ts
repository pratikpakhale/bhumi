/**
 * The one place Bhumi keeps anything of its own: a Cloudflare R2 bucket.
 *
 * Accounts and collections are a JSON file each, and every write is
 * conditional on the file's ETag. That compare-and-swap is all the consistency
 * the accounts need — a name is claimed by creating its file only if absent,
 * and a collection is replaced only if nobody wrote it since it was read — so
 * there is no database to run. Everything sits under `bhumi/`, so the bucket
 * can be shared with other projects.
 *
 * Configured by `R2_ENDPOINT` (the bucket's S3 API endpoint,
 * `https://<account>.r2.cloudflarestorage.com`), `R2_ACCESS_KEY_ID`,
 * `R2_SECRET_ACCESS_KEY` and `R2_BUCKET`.
 */

import { GetObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";

const PREFIX = "bhumi/";

let client: S3Client | null = null;

function s3(): S3Client {
  if (client) return client;
  const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error("Accounts are not configured: set R2_ENDPOINT, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.");
  }
  client = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
  return client;
}

function bucket(): string {
  const name = process.env.R2_BUCKET;
  if (!name) throw new Error("Accounts are not configured: set R2_BUCKET.");
  return name;
}

const status = (err: unknown) => (err instanceof S3ServiceException ? err.$metadata.httpStatusCode : undefined);

/** A stored file and the version it was read at. */
export interface Stored<T> {
  value: T;
  etag: string;
}

/** Read a JSON file, or null if there is none. */
export async function readJson<T>(key: string): Promise<Stored<T> | null> {
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: PREFIX + key }));
    return { value: JSON.parse(await res.Body!.transformToString()) as T, etag: res.ETag! };
  } catch (err) {
    if (status(err) === 404) return null;
    throw err;
  }
}

/**
 * Write a JSON file, only if it is still at `expected` — an ETag, or `null`
 * for "does not exist yet". Returns the new ETag, or null when someone else
 * wrote first.
 */
export async function writeJson(key: string, value: unknown, expected: string | null): Promise<string | null> {
  try {
    const res = await s3().send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: PREFIX + key,
        Body: JSON.stringify(value),
        ContentType: "application/json",
        ...(expected === null ? { IfNoneMatch: "*" } : { IfMatch: expected }),
      }),
    );
    return res.ETag!;
  } catch (err) {
    // 412: the precondition failed. 409: another conditional write to the same
    // key was in flight. Either way, someone else got there first.
    if (status(err) === 412 || status(err) === 409) return null;
    throw err;
  }
}
