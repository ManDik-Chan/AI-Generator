import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Prisma } from "@prisma/client";
import { fail } from "./release-context";
import { MAX_REGISTRY_BYTES } from "./quarantine-content";

export const QUARANTINE_BUCKET = "registry-quarantine-v1";
export const CANDIDATE_BUCKET = "registry-candidates-v1";
type Bucket = typeof QUARANTINE_BUCKET | typeof CANDIDATE_BUCKET;
export const quarantinePath = (project: string, asset: string, id: string, digest: string) => `q1/${project}/${asset}/${id}/${digest}`;
export const candidatePath = (project: string, asset: string, quarantine: string, id: string) => `c1/${project}/${asset}/${quarantine}/${id}`;
const idPattern = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
const sourceKey = new RegExp(`^q1/${idPattern}/${idPattern}/${idPattern}/[a-f0-9]{64}$`);
const candidateKey = new RegExp(`^c1/${idPattern}/${idPattern}/${idPattern}/${idPattern}$`);
function assertLocator(bucket: Bucket, path: string) {
  if (!(bucket === QUARANTINE_BUCKET ? sourceKey.test(path) : bucket === CANDIDATE_BUCKET && candidateKey.test(path))) fail("INVALID_INPUT", 422);
}

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return fail("UNAVAILABLE", 503);
  return { url: new URL(url).origin, key };
}
export async function assertRegistryBuckets(tx: Prisma.TransactionClient) {
  const buckets = await tx.$queryRaw<{ id: string; public: boolean }[]>`SELECT id,public FROM storage.buckets
    WHERE id IN (${QUARANTINE_BUCKET},${CANDIDATE_BUCKET}) FOR SHARE`;
  if (buckets.length !== 2 || buckets.some(b => b.public)) fail("UNAVAILABLE", 503);
}
export async function putRegistryObject(bucket: Bucket, path: string, bytes: Uint8Array, mime: string) {
  assertLocator(bucket, path);
  const { url, key } = config();
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (target, init) => fetch(target, { ...init, redirect: "error", signal: AbortSignal.timeout(5000) }) } });
  const { error } = await client.storage.from(bucket).upload(path, bytes, { contentType: mime, upsert: false, cacheControl: "0" });
  if (error) fail("UNAVAILABLE", 503);
}
export async function objectGeneration(tx: Prisma.TransactionClient, bucket: Bucket, path: string) {
  assertLocator(bucket, path);
  const [object] = await tx.$queryRaw<{ id: string; version: string; metadata: { size?: number; mimetype?: string } }[]>`
    SELECT id,coalesce(version,'') AS version,metadata FROM storage.objects WHERE bucket_id=${bucket} AND name=${path} FOR SHARE`;
  if (!object) return fail("OBJECT_CHANGED");
  return object;
}
export async function readRegistryObject(path: string, bucket: Bucket = QUARANTINE_BUCKET) {
  assertLocator(bucket, path);
  const { url, key } = config();
  try {
    const response = await fetch(`${url}/storage/v1/object/authenticated/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Cache-Control": "no-cache" },
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    if (!response.ok || !response.body) return fail("OBJECT_CHANGED");
    const length = response.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_REGISTRY_BYTES)) {
      await response.body.cancel(); return fail("ASSET_INVALID");
    }
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_REGISTRY_BYTES) return fail("ASSET_INVALID");
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    if (!size || (length !== null && Number(length) !== size)) return fail("ASSET_INVALID");
    return { bytes: Buffer.concat(chunks), mime: response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() };
  } catch { return fail("OBJECT_CHANGED"); }
}
