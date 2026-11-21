import { getSupabaseServer } from "./server";

/** Default bucket name for user-uploaded files */
const DEFAULT_BUCKET = "user-uploads";

/**
 * Throw when a storage path could leave the folder it names.
 *
 * storage-js puts the path into the request URL without encoding it, and the
 * URL parser resolves "." and ".." segments (also written as %2e) and treats
 * "\" as "/". It also drops tab, CR and LF anywhere in the URL, so ".\t." would
 * become ".." after this check: control characters are refused too. The upload
 * runs with the service-role key, so such a path could write into another
 * user's folder or another bucket.
 */
function assertSafeStoragePath(path: string): void {
  const unsafe =
    path.includes("\\") ||
    hasControlCharacter(path) ||
    path.split("/").some((segment) => {
      const dots = segment.replace(/%2e/gi, ".");
      return dots === "." || dots === "..";
    });
  if (unsafe) {
    // Do not echo the path: it is often built from user input.
    throw new Error(
      "Invalid storage path: dot segments, backslashes and control characters are not allowed",
    );
  }
}

/** True when the string has an ASCII control character (U+0000-U+001F or U+007F). */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Upload a file to Supabase Storage.
 *
 * Throws before any network call when the path has a "." or ".." segment
 * (also percent-encoded), a backslash or a control character.
 *
 * @param path   - Storage path, e.g. `avatars/{userId}.webp` or `cvs/{userId}/{uuid}.pdf`
 * @param data   - File contents as Buffer or Uint8Array
 * @param contentType - MIME type of the file
 * @param bucket - Storage bucket name (defaults to "user-uploads")
 * @returns The public URL of the uploaded file
 */
export async function uploadFile(
  path: string,
  data: Buffer | Uint8Array,
  contentType: string,
  bucket = DEFAULT_BUCKET,
): Promise<string> {
  assertSafeStoragePath(path);
  const supabase = getSupabaseServer();

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, data, {
      contentType,
      upsert: true, // overwrite if exists (e.g. avatar re-upload)
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  return getPublicUrl(path, bucket);
}

/**
 * Get the public URL for a file in Supabase Storage.
 *
 * @param path   - Storage path
 * @param bucket - Storage bucket name
 * @returns Public URL string
 */
export function getPublicUrl(
  path: string,
  bucket = DEFAULT_BUCKET,
): string {
  const supabase = getSupabaseServer();
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * The storage path of a public URL that {@link getPublicUrl} built for
 * `bucket`, e.g. `cvs/{userId}/{uuid}.pdf`; null when the URL is not a public
 * object URL of that bucket or its path is unsafe (see assertSafeStoragePath).
 */
export function storagePathFromPublicUrl(
  url: string | null | undefined,
  bucket = DEFAULT_BUCKET,
): string | null {
  if (!url) return null;
  // Read the raw string, not new URL(url).pathname: the URL parser would
  // resolve a ".." (or "%2e%2e") segment into a different, valid-looking path
  // instead of letting the check below refuse it.
  const withoutQuery = url.split(/[?#]/, 1)[0] ?? "";
  const marker = `/storage/v1/object/public/${bucket}/`;
  const at = withoutQuery.indexOf(marker);
  if (at === -1) return null;
  let path: string;
  try {
    path = decodeURIComponent(withoutQuery.slice(at + marker.length));
  } catch {
    return null;
  }
  if (!path) return null;
  try {
    assertSafeStoragePath(path);
  } catch {
    return null;
  }
  return path;
}

/**
 * Delete a file from Supabase Storage. Logs (does not throw) when Storage
 * refuses; throws before any network call on an unsafe path, like
 * {@link uploadFile}.
 *
 * @param path   - Storage path
 * @param bucket - Storage bucket name
 */
export async function deleteFile(
  path: string,
  bucket = DEFAULT_BUCKET,
): Promise<void> {
  assertSafeStoragePath(path);
  const supabase = getSupabaseServer();
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) {
    console.warn(`[storage] Failed to delete ${path}:`, error.message);
  }
}
