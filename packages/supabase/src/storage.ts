import { getSupabaseServer } from "./server";

/** Default bucket name for user-uploaded files */
const DEFAULT_BUCKET = "user-uploads";

/** How many entries one Storage list call returns. */
const LIST_PAGE_SIZE = 100;

/** Every extension the avatar route stores, as `avatars/{userId}.{ext}`. */
const AVATAR_EXTENSIONS = ["jpg", "png", "webp"] as const;

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
 * Delete a file from Supabase Storage.
 *
 * @param path   - Storage path
 * @param bucket - Storage bucket name
 */
export async function deleteFile(
  path: string,
  bucket = DEFAULT_BUCKET,
): Promise<void> {
  const supabase = getSupabaseServer();
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) {
    console.warn(`[storage] Failed to delete ${path}:`, error.message);
  }
}

/**
 * Delete every file a user uploaded: each CV in `cvs/{userId}/` and the avatar
 * at `avatars/{userId}.jpg`, `.png` or `.webp`.
 *
 * Best effort: failures are logged and never thrown, so a caller that already
 * deleted the user's row can still answer the request. A user id that is
 * empty, has a slash or would fail the storage path check is refused before any
 * Storage call, because an empty or nested id would list another folder.
 *
 * @param userId - The deleted user's id
 * @param bucket - Storage bucket name (defaults to "user-uploads")
 */
export async function deleteUserFiles(
  userId: string,
  bucket = DEFAULT_BUCKET,
): Promise<void> {
  const folder = `cvs/${userId}`;
  try {
    if (!userId || userId.includes("/")) {
      throw new Error("Invalid user id for storage cleanup");
    }
    assertSafeStoragePath(folder);
  } catch (err) {
    console.warn(
      "[storage] Refused to delete user files:",
      err instanceof Error ? err.message : err,
    );
    return;
  }

  try {
    const files = getSupabaseServer().storage.from(bucket);

    // List the whole folder before removing anything: removing while paging
    // by offset would shift the later pages and skip files.
    const paths: string[] = [];
    for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
      const { data, error } = await files.list(folder, {
        limit: LIST_PAGE_SIZE,
        offset,
      });
      if (error || !data) {
        console.warn(
          `[storage] Failed to list ${folder}:`,
          error?.message ?? "no data",
        );
        break;
      }
      paths.push(...data.map((file) => `${folder}/${file.name}`));
      if (data.length < LIST_PAGE_SIZE) break;
    }
    for (const ext of AVATAR_EXTENSIONS) {
      paths.push(`avatars/${userId}.${ext}`);
    }

    for (let i = 0; i < paths.length; i += LIST_PAGE_SIZE) {
      const { error } = await files.remove(paths.slice(i, i + LIST_PAGE_SIZE));
      if (error) {
        console.warn(
          `[storage] Failed to delete files of user ${userId}:`,
          error.message,
        );
      }
    }
  } catch (err) {
    console.warn(
      `[storage] Failed to delete files of user ${userId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
