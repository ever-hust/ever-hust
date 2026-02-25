import { getSupabaseServer } from "./server";

/** Default bucket name for user-uploaded files */
const DEFAULT_BUCKET = "user-uploads";

/**
 * Upload a file to Supabase Storage.
 *
 * @param path   - Storage path, e.g. `avatars/{userId}.webp` or `cvs/{userId}/{filename}`
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
